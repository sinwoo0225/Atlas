using System.ComponentModel;
using ModelContextProtocol.Server;
using ProjectManager.Application.Services;

namespace ProjectManager.Mcp.Tools;

[McpServerToolType]
public static class PlanTools
{
    [McpServerTool(Name = "atlas_plan_context"),
     Description("용량인지 계획 컨텍스트 1콜 — 프로젝트의 작업+의존성+배정+자원(용량)+임계경로+진단(마감초과·의존성위반)을 한 번에. " +
                 "리스케줄/자원 배분을 추론할 때 list 콜 여러 번 대신 이걸 먼저 호출. wbs context 의 일정 계획 버전.")]
    public static async Task<string> Context(
        PlanContextService svc, int projectId, int? versionId = null,
        [Description("자원(용량) 섹션 포함 (기본 true)")] bool includeResources = true,
        [Description("임계경로 섹션 포함 (기본 true)")] bool includeCriticalPath = true)
    {
        var bundle = await svc.GetPlanContextAsync(projectId, versionId, includeResources, includeCriticalPath)
            ?? throw new InvalidOperationException($"프로젝트 {projectId} 를 찾을 수 없습니다.");
        return McpJson.Serialize(bundle);
    }
}
