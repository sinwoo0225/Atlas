using System.Diagnostics;
using System.Text;

namespace ProjectManager.Infrastructure.ExternalTools;

public record ClaudeCheckResult(bool Available, string? Sample, string? Error);

/// <summary>
/// 로컬에 설치된 Claude Code CLI(`claude -p`)를 헤드리스로 호출. 프롬프트는 stdin 으로 전달해
/// 한글·장문의 인자 escaping/길이 문제를 피한다. API 키/SDK 불필요 — 사용자 기존 로그인 사용.
/// </summary>
public class ClaudeCliService
{
    // PATH 의 claude 보다 사용자 설치 경로를 우선 — 백엔드 프로세스가 PATH 를 못 물려받는 경우 대비.
    private static string ResolveClaude()
    {
        var explicitPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".local", "bin", "claude.exe");
        return File.Exists(explicitPath) ? explicitPath : "claude";
    }

    /// <summary>프롬프트 전체를 stdin 으로 넘겨 `claude -p` 실행. (ok, stdout, stderr).</summary>
    public async Task<(bool Ok, string Stdout, string Stderr)> RunAsync(string promptStdin, int timeoutMs)
    {
        var psi = new ProcessStartInfo
        {
            FileName = ResolveClaude(),
            UseShellExecute = false,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardInputEncoding = Encoding.UTF8,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            CreateNoWindow = true,
        };
        psi.ArgumentList.Add("-p");

        using var proc = new Process { StartInfo = psi };
        try
        {
            proc.Start();
        }
        catch (Exception ex)
        {
            return (false, string.Empty, $"claude 실행 실패 (설치/경로 확인): {ex.Message}");
        }

        await proc.StandardInput.WriteAsync(promptStdin);
        proc.StandardInput.Close();

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
            return (false, string.Empty, $"claude 응답 시간 초과 ({timeoutMs / 1000}s)");
        }

        var stdout = await stdoutTask;
        var stderr = await stderrTask;
        return (proc.ExitCode == 0, stdout, stderr);
    }

    /// <summary>작은 실프롬프트 1회 왕복으로 바이너리+인증+출력을 한 번에 검증.</summary>
    public async Task<ClaudeCheckResult> CheckAsync()
    {
        var (ok, stdout, stderr) = await RunAsync("'OK'라고만 답해.", 30_000);
        var sample = stdout.Trim();
        if (ok && sample.Length > 0)
            return new ClaudeCheckResult(true, sample, null);
        var err = stderr.Trim();
        return new ClaudeCheckResult(false, null, err.Length > 0 ? err : "claude 호출에 실패했습니다.");
    }

    /// <summary>논의내용을 한국어로 요약. 실패 시 예외.</summary>
    public async Task<string> SummarizeAsync(string discussion)
    {
        if (string.IsNullOrWhiteSpace(discussion))
            throw new InvalidOperationException("요약할 논의내용이 없습니다.");

        var prompt =
            "다음 회의 논의내용을 한국어로 간결히 요약해줘. 핵심 논의 주제·결정사항·후속 액션을 " +
            "불릿으로 정리하고, 요약 본문만 출력해(머리말·맺음말·코드블록 없이):\n\n" + discussion;

        var (ok, stdout, stderr) = await RunAsync(prompt, 120_000);
        if (!ok)
            throw new InvalidOperationException(
                string.IsNullOrWhiteSpace(stderr) ? "Claude 요약 호출에 실패했습니다." : stderr.Trim());

        var summary = stdout.Trim();
        if (summary.Length == 0)
            throw new InvalidOperationException("요약 결과가 비어 있습니다.");
        return summary;
    }
}
