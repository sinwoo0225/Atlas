using System.Globalization;
using ProjectManager.Core.DTOs;
using ProjectManager.Infrastructure.ExternalTools;

namespace ProjectManager.Application.Services;

// 업무 정보(GitRepo 타입)에 연결된 소스 저장소(.git)의 커밋 이력·동기화 상태를 git CLI 로 읽어 DTO 로 빚는다.
// 저장소를 수정하지 않는 읽기 전용. 경로 검증·git 미설치는 친절한 에러로 흡수.
// 저장소 경로(path)를 인자로 받는다 — 한 프로젝트에 GitRepo 업무 정보를 여러 개 둘 수 있어
// projectId 가 아니라 path 기준으로 동작한다. 호출자(컨트롤러)가 DevInfoItem 의 FilePath 를 해석해 넘긴다.
public class GitHistoryService(GitCliService git)
{
    // git log pretty-format 의 필드/레코드 구분자 — 한글·공백·특수문자 안전(US/RS 제어문자).
    private const char FieldSep = (char)0x1F;   // %x1f
    private const char RecordSep = (char)0x1E;  // %x1e

    public Task<(bool Valid, string? Error)> ValidateAsync(string path) => git.ValidateRepoAsync(path);

    public async Task<GitStatusDto> GetStatusByPathAsync(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return new GitStatusDto(false, null, false, null, false, 0, 0, false, null);

        var (valid, error) = await git.ValidateRepoAsync(path);
        if (!valid)
            return new GitStatusDto(true, path, false, null, false, 0, 0, false, error);

        // 현재 브랜치 (detached 면 "HEAD").
        var (brOk, brOut, _) = await git.RunAsync(new[] { "rev-parse", "--abbrev-ref", "HEAD" }, path);
        var branch = brOk ? brOut.Trim() : null;

        // 더티 여부 — porcelain 출력이 비어있지 않으면 변경 있음.
        var (stOk, stOut, _) = await git.RunAsync(new[] { "status", "--porcelain" }, path);
        var dirty = stOk && stOut.Trim().Length > 0;

        // upstream 대비 ahead/behind. upstream 없으면 명령이 실패 → HasUpstream=false.
        var hasUpstream = false;
        var ahead = 0;
        var behind = 0;
        var (abOk, abOut, _) = await git.RunAsync(
            new[] { "rev-list", "--count", "--left-right", "@{upstream}...HEAD" }, path);
        if (abOk)
        {
            // 출력: "<behind>\t<ahead>" (left=upstream에만 있는 것=behind, right=HEAD에만=ahead)
            var parts = abOut.Trim().Split('\t', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 2
                && int.TryParse(parts[0], out behind)
                && int.TryParse(parts[1], out ahead))
            {
                hasUpstream = true;
            }
        }

        return new GitStatusDto(true, path, true, branch, hasUpstream, ahead, behind, dirty, null);
    }

    public async Task<GitLogDto> GetLogByPathAsync(string path, int limit, int skip, bool all)
    {
        if (string.IsNullOrWhiteSpace(path))
            throw new InvalidOperationException("이 항목에 연결된 git 저장소 경로가 없습니다.");

        var (valid, error) = await git.ValidateRepoAsync(path);
        if (!valid)
            throw new InvalidOperationException(error ?? "유효한 git 저장소가 아닙니다.");

        limit = Math.Clamp(limit, 1, 1000);
        skip = Math.Max(0, skip);

        // 미push 커밋 집합 — 원격이 있을 때만. (원격 없으면 push 개념 자체가 없어 하이라이트 안 함.)
        var unpushed = await GetUnpushedSetAsync(path);

        // %H 해시 / %P 부모들 / %an 작성자 / %ae 이메일 / %aI ISO날짜 / %D ref decoration / %s 제목
        var format = string.Join(FieldSep.ToString(),
            "%H", "%P", "%an", "%ae", "%aI", "%D", "%s") + RecordSep;
        var args = new List<string> { "log" };
        // --topo-order: 부모가 자식보다 먼저 나오지 않도록 보장 — 프론트 레인 배치 알고리즘의 전제.
        args.Add("--topo-order");
        if (all) args.Add("--all");
        args.Add($"--skip={skip}");
        args.Add($"--max-count={limit + 1}"); // +1 로 다음 페이지 존재 여부 판단
        args.Add($"--pretty=format:{format}");

        var (ok, stdout, stderr) = await git.RunAsync(args, path, 20_000);
        if (!ok)
            throw new InvalidOperationException(stderr.Trim().Length > 0 ? stderr.Trim() : "git log 실행에 실패했습니다.");

        var commits = new List<GitCommitDto>();
        foreach (var rawRecord in stdout.Split(RecordSep))
        {
            var record = rawRecord.Trim('\n', '\r', ' ');
            if (record.Length == 0) continue;
            var f = record.Split(FieldSep);
            if (f.Length < 7) continue;

            var hash = f[0];
            var parents = f[1].Length == 0
                ? Array.Empty<string>()
                : f[1].Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var date = DateTimeOffset.TryParse(f[4], CultureInfo.InvariantCulture,
                DateTimeStyles.RoundtripKind, out var dto) ? dto.UtcDateTime : DateTime.UtcNow;
            var refs = ParseRefs(f[5]);
            var onRemote = unpushed is null || !unpushed.Contains(hash);

            commits.Add(new GitCommitDto(
                hash,
                hash.Length >= 7 ? hash[..7] : hash,
                parents,
                f[2],
                f[3],
                date,
                f[6],
                refs,
                onRemote));
        }

        var hasMore = commits.Count > limit;
        if (hasMore) commits.RemoveRange(limit, commits.Count - limit);
        return new GitLogDto(commits, hasMore);
    }

    // %D decoration("HEAD -> main, origin/main, tag: v1.0") 를 개별 ref 라벨로 분해.
    // "HEAD -> " 접두는 떼고, "tag: " 접두는 프론트가 태그로 식별하도록 보존.
    private static string[] ParseRefs(string decoration)
    {
        if (string.IsNullOrWhiteSpace(decoration)) return Array.Empty<string>();
        return decoration
            .Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(s => s.Trim())
            .Select(s => s.StartsWith("HEAD -> ", StringComparison.Ordinal) ? s["HEAD -> ".Length..] : s)
            .Where(s => s.Length > 0)
            .ToArray();
    }

    // 원격에 아직 없는(미push) 커밋 해시 집합. 원격이 하나도 없으면 null (하이라이트 비활성).
    private async Task<HashSet<string>?> GetUnpushedSetAsync(string path)
    {
        var (remOk, remOut, _) = await git.RunAsync(new[] { "remote" }, path);
        if (!remOk || remOut.Trim().Length == 0) return null;

        var (ok, stdout, _) = await git.RunAsync(
            new[] { "rev-list", "--all", "--not", "--remotes" }, path, 20_000);
        if (!ok) return null;
        var set = new HashSet<string>(StringComparer.Ordinal);
        foreach (var line in stdout.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            set.Add(line.Trim());
        return set;
    }
}
