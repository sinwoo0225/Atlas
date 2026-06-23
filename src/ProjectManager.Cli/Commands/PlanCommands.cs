using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Services;

namespace ProjectManager.Cli.Commands;

internal static class PlanCommands
{
    public static Command Build(IServiceProvider services)
    {
        var cmd = new Command("plan", "일정 계획 — 용량인지 컨텍스트 번들 (에이전트 리스케줄/배분 추론용)");
        cmd.AddCommand(BuildContext(services));
        return cmd;
    }

    private static Command BuildContext(IServiceProvider services)
    {
        var projOpt = new Option<int>("--project", "프로젝트 ID") { IsRequired = true };
        var verOpt = new Option<int?>("--version", "WBS 버전 ID");
        var noResources = new Option<bool>("--no-resources", "자원(용량) 섹션 제외");
        var noCritical = new Option<bool>("--no-critical-path", "임계경로 섹션 제외");
        var c = new Command("context",
            "프로젝트 계획 컨텍스트 1콜 — 작업+의존성+배정+자원(용량)+임계경로+진단(마감초과·의존성위반). 리스케줄/배분 추론의 단일 진입점")
        { projOpt, verOpt, noResources, noCritical };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var svc = services.GetRequiredService<PlanContextService>();
            var bundle = await svc.GetPlanContextAsync(
                pr.GetValueForOption(projOpt), pr.GetValueForOption(verOpt),
                includeResources: !pr.GetValueForOption(noResources),
                includeCriticalPath: !pr.GetValueForOption(noCritical));
            if (bundle is null) { ctx.ExitCode = CliJson.WriteError("not_found", "프로젝트를 찾을 수 없습니다."); return; }
            CliJson.WriteSuccess(bundle);
        }));
        return c;
    }
}
