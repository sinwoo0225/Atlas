using System.CommandLine.Invocation;

namespace ProjectManager.Cli.Commands;

internal static class HandlerHelpers
{
    // 모든 verb 의 공통 try/catch — 미처리 예외를 stderr JSON + exit 2 로 통일.
    public static async Task RunAsync(InvocationContext ctx, Func<Task> body)
    {
        try { await body(); }
        catch (Exception ex) { ctx.ExitCode = CliJson.WriteException(ex); }
    }
}
