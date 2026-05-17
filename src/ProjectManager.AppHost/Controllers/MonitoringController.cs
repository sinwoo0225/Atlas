using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
[Route("api/monitoring")]
public class MonitoringController(MonitoringService svc) : ControllerBase
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
