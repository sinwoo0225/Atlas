using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;
using ProjectManager.Core.DTOs;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
[Route("api/projects/{projectId:int}/worklogs")]
public class WorkLogController(WorkLogService svc, WbsService wbsSvc, IssueService issueSvc) : ControllerBase
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

    // '진행 항목 자동 작성'(F5) — 프로젝트의 진행(InProgress) WBS 작업·이슈를 지정 날짜 '한 일'에 [시작]으로 일괄 추가.
    // 자동 등록과 동일 규칙(리프만·계층·범위 게이트). 갱신된 주(week) 일지를 반환해 프론트가 즉시 반영.
    [HttpPost("{date}/auto-progress")]
    public async Task<IActionResult> AutoProgress(int projectId, string date)
    {
        if (!TryParseDate(date, out var d))
            return BadRequest("date 형식은 yyyy-MM-dd");
        var wbs = await wbsSvc.AutoLogInProgressAsync(projectId, d);
        var issues = await issueSvc.AutoLogInProgressAsync(projectId, d);
        var week = await svc.GetWeekAsync(projectId, WorkLogService.StartOfWeek(d));
        return Ok(new { wbs, issues, week });
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
