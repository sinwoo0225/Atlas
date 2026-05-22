using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;

namespace ProjectManager.AppHost.Controllers;

public record KanbanMoveRequest(string Kind, int Id, string Column);

[ApiController]
[Route("api/monitoring")]
public class MonitoringController(MonitoringService svc, WbsService wbsSvc, IssueService issueSvc) : ControllerBase
{
    [HttpGet("today")]
    public async Task<IActionResult> Today() => Ok(await svc.GetTodayAsync());

    [HttpGet("charts")]
    public async Task<IActionResult> Charts() => Ok(await svc.GetChartsAsync());

    [HttpGet("resource-heatmap")]
    public async Task<IActionResult> ResourceHeatmap() => Ok(await svc.GetResourceHeatmapAsync());

    // '프로젝트별 활동량' 위젯 — 기본 30일 / 상위 20개. days/top 은 안전 범위로 clamp.
    [HttpGet("activity-by-project")]
    public async Task<IActionResult> ActivityByProject([FromQuery] int days = 30, [FromQuery] int top = 20)
    {
        var d = Math.Clamp(days, 1, 365);
        var t = Math.Clamp(top, 1, 50);
        return Ok(await svc.GetActivityByProjectAsync(d, t));
    }

    // 주간 업무일지 통합에 첨부할 '이슈 목록' — 프로젝트별 미해결 이슈 스냅샷.
    [HttpGet("issues/open")]
    public async Task<IActionResult> OpenIssues() => Ok(await svc.GetOpenIssuesByProjectAsync());

    // 마감 캘린더 — from/to (yyyy-MM-dd, 양끝 포함). 누락 시 이번 달. 범위는 최대 92일로 clamp.
    [HttpGet("calendar")]
    public async Task<IActionResult> Calendar([FromQuery] string? from, [FromQuery] string? to)
    {
        static bool TryDate(string? s, out DateTime d) =>
            DateTime.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out d);

        DateTime fromDate, toDate;
        if (TryDate(from, out var f)) fromDate = f.Date;
        else { var now = DateTime.Today; fromDate = new DateTime(now.Year, now.Month, 1); }

        if (TryDate(to, out var t)) toDate = t.Date;
        else toDate = fromDate.AddMonths(1).AddDays(-1);

        if (toDate < fromDate) toDate = fromDate;
        if ((toDate - fromDate).TotalDays > 92) toDate = fromDate.AddDays(92);

        return Ok(await svc.GetCalendarAsync(fromDate, toDate));
    }

    // 칸반 보드 — 미완 전부 + 완료는 doneSince 이후(누락 시 14일 전). doneSince 는 yyyy-MM-dd(UTC 자정 해석).
    [HttpGet("kanban")]
    public async Task<IActionResult> Kanban([FromQuery] string? doneSince)
    {
        DateTime since;
        if (!string.IsNullOrWhiteSpace(doneSince)
            && DateTime.TryParseExact(doneSince, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed))
            since = parsed;
        else
            since = DateTime.UtcNow.AddDays(-14);
        return Ok(await svc.GetKanbanAsync(since));
    }

    // 칸반 드래그 — 카드(WBS/이슈)를 컬럼(todo/doing/done)으로 이동 → 상태 변경. 컬럼→상태 매핑은 kind 별.
    [HttpPost("kanban/move")]
    public async Task<IActionResult> KanbanMove([FromBody] KanbanMoveRequest req)
    {
        var kind = req.Kind?.ToLowerInvariant();
        var column = req.Column?.ToLowerInvariant();
        if (kind == "wbs")
        {
            var status = column switch
            {
                "todo" => WbsStatus.Planned,
                "doing" => WbsStatus.InProgress,
                "done" => WbsStatus.Done,
                _ => (WbsStatus?)null,
            };
            if (status is null) return BadRequest(new { error = "잘못된 컬럼" });
            return await wbsSvc.SetStatusAsync(req.Id, status.Value) ? Ok() : NotFound();
        }
        if (kind == "issue")
        {
            // 완료 컬럼 드롭은 Resolved 로(Closed 는 이슈 페이지에서 수동).
            var status = column switch
            {
                "todo" => IssueStatus.Open,
                "doing" => IssueStatus.InProgress,
                "done" => IssueStatus.Resolved,
                _ => (IssueStatus?)null,
            };
            if (status is null) return BadRequest(new { error = "잘못된 컬럼" });
            return await issueSvc.SetStatusAsync(req.Id, status.Value) ? Ok() : NotFound();
        }
        return BadRequest(new { error = "잘못된 종류" });
    }

    [HttpGet("worklogs/weekly")]
    public async Task<IActionResult> WeeklyWorkLogs([FromQuery] string? weekStart)
    {
        DateTime ws;
        if (!string.IsNullOrWhiteSpace(weekStart)
            && DateTime.TryParseExact(weekStart, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
            ws = parsed.Date;
        else
            ws = WorkLogService.StartOfWeek(DateTime.Today);
        return Ok(await svc.GetWeeklyWorkLogsAsync(ws));
    }
}
