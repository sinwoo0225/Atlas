using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;

namespace ProjectManager.AppHost.Controllers;

public record KanbanMoveRequest(string Kind, int Id, string Column);

[ApiController]
[Route("api/monitoring")]
public class MonitoringController(MonitoringService svc, WbsService wbsSvc, IssueService issueSvc, CapacityService capacitySvc, AttentionService attentionSvc) : ControllerBase
{
    // 주의 피드 — 마감 초과/임박·과배분·미배정·임박 마일스톤·정체 프로젝트 합성 알림.
    [HttpGet("attention")]
    public async Task<IActionResult> Attention() => Ok(await attentionSvc.GetAttentionAsync());

    [HttpGet("today")]
    public async Task<IActionResult> Today() => Ok(await svc.GetTodayAsync());

    [HttpGet("charts")]
    public async Task<IActionResult> Charts() => Ok(await svc.GetChartsAsync());

    [HttpGet("resource-heatmap")]
    public async Task<IActionResult> ResourceHeatmap() => Ok(await svc.GetResourceHeatmapAsync());

    // 용량 히트맵 — 자원 × 주 수요/가용/가동률(시간 기반). 건수 기반 resource-heatmap 의 상위호환.
    [HttpGet("resource-capacity")]
    public async Task<IActionResult> ResourceCapacity([FromQuery] int weeks = 8)
        => Ok(await capacitySvc.GetHeatmapAsync(weeks));

    // 교차 프로젝트 가동률 리포트.
    [HttpGet("utilization")]
    public async Task<IActionResult> Utilization([FromQuery] int weeks = 8, [FromQuery] string? department = null)
        => Ok(await capacitySvc.GetUtilizationReportAsync(weeks, department));

    // 개요 Risk Radar — 전 프로젝트 마감 초과/임박 WBS + High Open 이슈.
    [HttpGet("risk")]
    public async Task<IActionResult> Risk() => Ok(await svc.GetRiskOverviewAsync());

    // 방치된 프로젝트 — 활성인데 days일 이상 무활동. days 는 1~120 으로 clamp.
    [HttpGet("stale")]
    public async Task<IActionResult> Stale([FromQuery] int days = 14)
        => Ok(await svc.GetStaleProjectsAsync(Math.Clamp(days, 1, 120)));

    // 담당자별 워크로드+위험 + 미할당 큐 (관리자 렌즈).
    [HttpGet("workload")]
    public async Task<IActionResult> Workload() => Ok(await svc.GetWorkloadByAssigneeAsync());

    // Aging WIP — 진행중 항목의 나이 내림차순.
    [HttpGet("aging-wip")]
    public async Task<IActionResult> AgingWip() => Ok(await svc.GetAgingWipAsync());

    // 카테고리별 프로젝트 분포 (개요 도넛).
    [HttpGet("category-breakdown")]
    public async Task<IActionResult> CategoryBreakdown() => Ok(await svc.GetCategoryBreakdownAsync());

    // 카테고리별 포트폴리오 롤업 — 프로젝트수·WBS진척·미결이슈·자원수요·위험.
    [HttpGet("portfolio")]
    public async Task<IActionResult> Portfolio() => Ok(await svc.GetPortfolioRollupAsync());

    // Phase 2 추세 번들 — Throughput/이슈순증감/사이클타임/활동추세 + 담당자별 처리량·사이클타임.
    // weeks 4~52, activityDays 7~120 으로 clamp. 추세/담당자 탭 지연 로드용.
    [HttpGet("trends")]
    public async Task<IActionResult> Trends([FromQuery] int weeks = 12, [FromQuery] int activityDays = 30)
        => Ok(await svc.GetTrendsAsync(Math.Clamp(weeks, 4, 52), Math.Clamp(activityDays, 7, 120)));

    // Phase 3 예측·고급 번들 — CFD/Monte Carlo/간이 예상완료/부서 롤업. 추세 탭 '실험' 섹션 지연 로드.
    [HttpGet("forecast")]
    public async Task<IActionResult> Forecast([FromQuery] int weeks = 12)
        => Ok(await svc.GetForecastAsync(Math.Clamp(weeks, 4, 52)));

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

    // 주간 회고 다이제스트 — 완료한 항목 / 놓친 마감 / 다음 주 마감 예정. weekStart 규약은 worklogs/weekly 와 동일.
    [HttpGet("weekly-review")]
    public async Task<IActionResult> WeeklyReview([FromQuery] string? weekStart)
    {
        DateTime ws;
        if (!string.IsNullOrWhiteSpace(weekStart)
            && DateTime.TryParseExact(weekStart, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
            ws = parsed.Date;
        else
            ws = WorkLogService.StartOfWeek(DateTime.Today);
        return Ok(await svc.GetWeeklyReviewAsync(ws));
    }
}
