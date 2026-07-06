using System.CommandLine;

namespace ProjectManager.Cli.Commands;

// Claude Code 스킬 + 커맨드 설치 — 배포본에 동봉된 skills/atlas 와 형제 commands/atlas-*.md 를
// 사용자 프로필의 ~/.claude 로 복사. MSIX 인스톨러는 ~/.claude 에 못 쓰지만(샌드박스),
// 사용자 권한으로 도는 atlas-cli 는 쓸 수 있다.
// 커맨드는 사용자와 공유되는 ~/.claude/commands 에 들어가므로 디렉토리 삭제 없이 atlas-*.md 만 덮어쓴다(비파괴).
internal static class SkillCommands
{
    public static Command Build(IServiceProvider services)
    {
        var cmd = new Command("skill", "Claude Code 스킬·커맨드 (atlas-cli/atlas-mcp 사용 가이드) 설치");
        cmd.AddCommand(BuildInstall());
        return cmd;
    }

    private static Command BuildInstall()
    {
        var fromOpt = new Option<string?>("--from", "스킬 소스 디렉토리 (생략 시 실행 파일 옆 동봉본 자동 탐색)");
        var forceOpt = new Option<bool>("--force", "기존 스킬 설치본을 지우고 새로 복사 (커맨드는 항상 파일 단위 덮어쓰기)");
        var c = new Command("install", "Atlas 스킬을 ~/.claude/skills/atlas, 커맨드를 ~/.claude/commands 에 설치/갱신") { fromOpt, forceOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, () =>
        {
            var source = ResolveSource(ctx.ParseResult.GetValueForOption(fromOpt));
            if (source is null)
            {
                ctx.ExitCode = CliJson.WriteError("not_found",
                    "스킬 소스를 찾을 수 없습니다. 배포본(Atlas-Cli.exe) 옆 skills/atlas 가 없으면 --from <경로> 로 지정하세요.");
                return Task.CompletedTask;
            }
            var claudeDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude");

            // 1) 스킬: 전용 폴더라 --force 시 통째 재설치 안전
            var skillTarget = Path.Combine(claudeDir, "skills", "atlas");
            if (ctx.ParseResult.GetValueForOption(forceOpt) && Directory.Exists(skillTarget))
                Directory.Delete(skillTarget, recursive: true);
            var files = CopyDir(source, skillTarget);

            // 2) 커맨드: 형제 commands/atlas-*.md 를 공유 폴더에 additive 설치(디렉토리 삭제 없음)
            var commandsSrc = ResolveCommandsSource(source);
            var commandsTarget = Path.Combine(claudeDir, "commands");
            var commandFiles = commandsSrc is null
                ? Array.Empty<string>()
                : CopyAtlasCommands(commandsSrc, commandsTarget);

            CliJson.WriteSuccess(new
            {
                installed = true,
                source,
                target = skillTarget,
                files,
                commandsInstalled = commandFiles.Length,
                commandFiles,
                commandsTarget = commandsSrc is null ? null : commandsTarget,
            });
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

    // skills/atlas 의 패키지 루트(= skills 의 부모)에 있는 형제 commands/. atlas-*.md 존재로 검증.
    private static string? ResolveCommandsSource(string skillSource)
    {
        var pkg = Directory.GetParent(Path.GetFullPath(skillSource))?.Parent; // .../skills/atlas → skills → pkg
        if (pkg is null) return null;
        var dir = Path.Combine(pkg.FullName, "commands");
        return Directory.Exists(dir) && Directory.GetFiles(dir, "atlas-*.md").Length > 0 ? dir : null;
    }

    // 공유 폴더(~/.claude/commands)에 atlas-*.md 만 파일 단위 덮어쓰기 — 사용자의 다른 커맨드는 보존.
    private static string[] CopyAtlasCommands(string src, string dst)
    {
        Directory.CreateDirectory(dst);
        var names = new List<string>();
        foreach (var file in Directory.GetFiles(src, "atlas-*.md"))
        {
            var name = Path.GetFileName(file);
            File.Copy(file, Path.Combine(dst, name), overwrite: true);
            names.Add(name);
        }
        return names.ToArray();
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
