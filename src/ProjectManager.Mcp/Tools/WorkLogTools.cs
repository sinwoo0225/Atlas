using System.ComponentModel;
using ModelContextProtocol.Server;
using ProjectManager.Application.Services;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Mcp.Tools;

[McpServerToolType]
public static class WorkLogTools
{
    [McpServerTool(Name = "atlas_worklog_week"),
     Description("주간 업무일지 조회 (Monday 시작 7 일). weekStart 생략 시 오늘 기준 주.")]
    public static async Task<string> Week(
        WorkLogService svc,
        [Description("프로젝트 ID")] int projectId,
        [Description("주 시작일 YYYY-MM-DD — 생략 시 오늘 기준")] DateTime? weekStart = null) =>
        McpJson.Serialize(await svc.GetWeekAsync(projectId, weekStart ?? DateTime.Today));

    [McpServerTool(Name = "atlas_worklog_upsert"),
     Description("해당 일자 업무일지 upsert (없으면 생성, 있으면 덮어쓰기). done/plan/issues 모두 markdown")]
    public static async Task<string> Upsert(
        WorkLogService svc,
        [Description("프로젝트 ID")] int projectId,
        [Description("날짜 YYYY-MM-DD")] DateTime date,
        [Description("완료 (markdown)")] string? done = null,
        [Description("계획 (markdown)")] string? plan = null,
        [Description("이슈 (markdown)")] string? issues = null) =>
        McpJson.Serialize(await svc.UpsertAsync(projectId, date,
            new UpsertWorkLogDto(done ?? string.Empty, plan ?? string.Empty, issues ?? string.Empty)));
}
