using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;
using ProjectManager.Core.DTOs;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
[Route("api/projects/{projectId:int}/worklogs")]
public class WorkLogController(WorkLogService svc) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetWeek(int projectId, [FromQuery] string? weekStart)
    {
        if (!TryParseDate(weekStart, out var ws))
            ws = WorkLogService.StartOfWeek(DateTime.Today);
        return Ok(await svc.GetWeekAsync(projectId, ws));
    }

    [HttpPut("{date}")]
    public async Task<IActionResult> Upsert(int projectId, string date, [FromBody] UpsertWorkLogDto dto)
    {
        if (!TryParseDate(date, out var d))
            return BadRequest("date 형식은 yyyy-MM-dd");
        return Ok(await svc.UpsertAsync(projectId, d, dto));
    }

    private static bool TryParseDate(string? s, out DateTime result)
    {
        if (!string.IsNullOrWhiteSpace(s)
            && DateTime.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
        {
            result = parsed.Date;
            return true;
        }
        result = default;
        return false;
    }
}
