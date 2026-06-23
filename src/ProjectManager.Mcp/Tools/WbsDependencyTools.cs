using System.ComponentModel;
using ModelContextProtocol.Server;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Mcp.Tools;

[McpServerToolType]
public static class WbsDependencyTools
{
    [McpServerTool(Name = "atlas_wbs_link_dep"),
     Description("작업 의존성 추가 (선행→후행). type=FinishToStart(기본)|StartToStart|FinishToFinish|StartToFinish, lag=지연 영업일. 사이클·다른 프로젝트 거부.")]
    public static async Task<string> LinkDep(
        WbsDependencyService svc,
        [Description("선행 작업 ID")] int predecessorId,
        [Description("후행 작업 ID")] int successorId,
        WbsDependencyType? type = null,
        [Description("지연(영업일). 양수=간격, 음수=중첩")] int lagDays = 0) =>
        McpJson.Serialize(await svc.CreateAsync(new CreateWbsDependencyDto(
            predecessorId, successorId, type ?? WbsDependencyType.FinishToStart, lagDays)));

    [McpServerTool(Name = "atlas_wbs_unlink_dep"), Description("작업 의존성 제거")]
    public static async Task<string> UnlinkDep(WbsDependencyService svc, int predecessorId, int successorId)
    {
        if (!await svc.DeleteAsync(predecessorId, successorId))
            throw new InvalidOperationException("의존성을 찾을 수 없습니다.");
        return McpJson.Serialize(new { unlinked = true });
    }

    [McpServerTool(Name = "atlas_wbs_deps"),
     Description("의존성 조회 — projectId 전체 또는 wbsItemId 작업별(둘 중 하나)")]
    public static async Task<string> Deps(WbsDependencyService svc, int? projectId = null, int? wbsItemId = null)
    {
        if (wbsItemId is int wid) return McpJson.Serialize(await svc.GetByWbsItemAsync(wid));
        if (projectId is int pid) return McpJson.Serialize(await svc.GetByProjectAsync(pid));
        throw new InvalidOperationException("projectId 또는 wbsItemId 중 하나가 필요합니다.");
    }

    [McpServerTool(Name = "atlas_wbs_critical_path"),
     Description("임계경로(CPM) — leaf 작업 + 의존성으로 ES/EF/LS/LF·부동·임계 여부 계산. 날짜 부족 작업은 indeterminate. 읽기 전용.")]
    public static async Task<string> CriticalPath(
        SchedulingService svc, int projectId, int? versionId = null,
        [Description("주말 제외 (기본 true)")] bool skipWeekends = true) =>
        McpJson.Serialize(await svc.ComputeCriticalPathAsync(projectId, versionId, skipWeekends));

    [McpServerTool(Name = "atlas_wbs_reschedule"),
     Description("의존성 기반 자동 일정 — push-only(늦추기만). fromWbsItemId 지정 시 그 후행만, 생략(null) 시 프로젝트 전체. apply=false 면 미리보기(저장 안 함), true 면 적용.")]
    public static async Task<string> Reschedule(
        SchedulingService svc, int projectId,
        [Description("기준 작업 ID. 생략 시 프로젝트 전체 리스케줄")] int? fromWbsItemId = null,
        [Description("true 면 실제 적용, false(기본) 면 미리보기")] bool apply = false,
        [Description("주말 제외 (기본 true)")] bool skipWeekends = true)
    {
        var preview = fromWbsItemId is int from
            ? await svc.PreviewRescheduleAsync(projectId, from, skipWeekends)
            : await svc.PreviewProjectRescheduleAsync(projectId, skipWeekends);
        if (apply) await svc.ApplyRescheduleAsync(projectId, preview.Shifts, preview.SkipWeekends);
        return McpJson.Serialize(new { applied = apply, preview.Shifts });
    }
}
