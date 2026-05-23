using System.Diagnostics;
using System.Text;

namespace ProjectManager.Infrastructure.ExternalTools;

/// <summary>
/// 로컬에 설치된 git CLI 를 헤드리스로 호출하는 원시 러너. (ClaudeCliService 와 동형 패턴.)
/// 인자는 항상 ArgumentList 로만 전달해 셸을 거치지 않으므로 경로/인자 인젝션이 불가능하다.
/// 읽기 전용 명령(rev-parse·log·status·rev-list)만 호출한다 — 저장소를 수정하지 않는다.
/// </summary>
public class GitCliService
{
    // PATH 의 git 우선, 실패 시 Windows 기본 설치 경로 fallback (백엔드 프로세스가 PATH 를 못 물려받는 경우 대비).
    private static string ResolveGit()
    {
        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Git", "cmd", "git.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Git", "cmd", "git.exe"),
        };
        foreach (var c in candidates)
            if (!string.IsNullOrEmpty(c) && File.Exists(c)) return c;
        return "git";
    }

    /// <summary>git 명령 1회 실행. (ok, stdout, stderr). workingDir 가 저장소 루트가 된다.</summary>
    public async Task<(bool Ok, string Stdout, string Stderr)> RunAsync(
        IEnumerable<string> args, string workingDir, int timeoutMs = 15_000)
    {
        var psi = new ProcessStartInfo
        {
            FileName = ResolveGit(),
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            CreateNoWindow = true,
            WorkingDirectory = workingDir,
        };
        // 한글 경로/메시지가 mojibake 되지 않도록 git 출력 인코딩을 UTF-8 로 강제.
        psi.Environment["LC_ALL"] = "C.UTF-8";
        psi.ArgumentList.Add("-c");
        psi.ArgumentList.Add("core.quotepath=false");
        foreach (var a in args) psi.ArgumentList.Add(a);

        using var proc = new Process { StartInfo = psi };
        try
        {
            proc.Start();
        }
        catch (Exception ex)
        {
            return (false, string.Empty, $"git 실행 실패 (설치/경로 확인): {ex.Message}");
        }

        var stdoutTask = proc.StandardOutput.ReadToEndAsync();
        var stderrTask = proc.StandardError.ReadToEndAsync();

        using var cts = new CancellationTokenSource(timeoutMs);
        try
        {
            await proc.WaitForExitAsync(cts.Token);
        }
        catch (OperationCanceledException)
        {
            try { proc.Kill(entireProcessTree: true); } catch { /* best-effort */ }
            return (false, string.Empty, $"git 응답 시간 초과 ({timeoutMs / 1000}s)");
        }

        var stdout = await stdoutTask;
        var stderr = await stderrTask;
        return (proc.ExitCode == 0, stdout, stderr);
    }

    /// <summary>경로가 존재하는 디렉터리이고 git 작업 트리 안인지 검증.</summary>
    public async Task<(bool Valid, string? Error)> ValidateRepoAsync(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return (false, "경로가 비어 있습니다.");
        if (!Directory.Exists(path))
            return (false, "폴더를 찾을 수 없습니다.");

        var (ok, stdout, stderr) = await RunAsync(
            new[] { "rev-parse", "--is-inside-work-tree" }, path, 10_000);
        if (ok && stdout.Trim() == "true")
            return (true, null);

        var err = stderr.Trim();
        if (err.Contains("not a git repository", StringComparison.OrdinalIgnoreCase))
            return (false, "이 폴더는 git 저장소가 아닙니다 (.git 없음).");
        return (false, err.Length > 0 ? err : "git 저장소를 확인할 수 없습니다 (git 미설치 가능).");
    }
}
