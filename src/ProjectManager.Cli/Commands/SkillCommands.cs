using System.CommandLine;

namespace ProjectManager.Cli.Commands;

// Claude Code 스킬 설치 — 배포본에 동봉된 skills/atlas 를 사용자 프로필의 ~/.claude/skills/atlas 로 복사.
// MSIX 인스톨러는 ~/.claude 에 못 쓰지만(샌드박스), 사용자 권한으로 도는 atlas-cli 는 쓸 수 있다.
internal static class SkillCommands
{
    public static Command Build(IServiceProvider services)
    {
        var cmd = new Command("skill", "Claude Code 스킬 (atlas-cli/atlas-mcp 사용 가이드) 설치");
        cmd.AddCommand(BuildInstall());
        return cmd;
    }

    private static Command BuildInstall()
    {
        var fromOpt = new Option<string?>("--from", "스킬 소스 디렉토리 (생략 시 실행 파일 옆 동봉본 자동 탐색)");
        var forceOpt = new Option<bool>("--force", "기존 설치본을 지우고 새로 복사");
        var c = new Command("install", "Atlas 스킬을 ~/.claude/skills/atlas 에 설치/갱신") { fromOpt, forceOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, () =>
        {
            var source = ResolveSource(ctx.ParseResult.GetValueForOption(fromOpt));
            if (source is null)
            {
                ctx.ExitCode = CliJson.WriteError("not_found",
                    "스킬 소스를 찾을 수 없습니다. 배포본(Atlas-Cli.exe) 옆 skills/atlas 가 없으면 --from <경로> 로 지정하세요.");
                return Task.CompletedTask;
            }
            var target = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                ".claude", "skills", "atlas");
            if (ctx.ParseResult.GetValueForOption(forceOpt) && Directory.Exists(target))
                Directory.Delete(target, recursive: true);
            var files = CopyDir(source, target);
            CliJson.WriteSuccess(new { installed = true, source, target, files });
            return Task.CompletedTask;
        }));
        return c;
    }

    // --from > 실행파일 옆(배포본: 패키지 루트/포터블 exe 옆) > BaseDirectory·CWD 에서 walk-up(dev). SKILL.md 존재로 검증.
    private static string? ResolveSource(string? from)
    {
        var candidates = new List<string>();
        if (!string.IsNullOrWhiteSpace(from)) candidates.Add(from);
        candidates.Add(Path.Combine(AppContext.BaseDirectory, "skills", "atlas"));
        foreach (var start in new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() })
        {
            var dir = new DirectoryInfo(start);
            for (var i = 0; i < 8 && dir is not null; i++, dir = dir.Parent)
                candidates.Add(Path.Combine(dir.FullName, "skills", "atlas"));
        }
        return candidates.FirstOrDefault(p => File.Exists(Path.Combine(p, "SKILL.md")));
    }

    private static int CopyDir(string src, string dst)
    {
        Directory.CreateDirectory(dst);
        var n = 0;
        foreach (var file in Directory.GetFiles(src))
        {
            File.Copy(file, Path.Combine(dst, Path.GetFileName(file)), overwrite: true);
            n++;
        }
        foreach (var dir in Directory.GetDirectories(src))
            n += CopyDir(dir, Path.Combine(dst, Path.GetFileName(dir)));
        return n;
    }
}
