using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
public class ActivityController(ActivityLogService svc) : ControllerBase
{
    // 프로젝트별 활동 피드 — Dashboard 의 "최근 활동" 위젯이 호출.
    [HttpGet("api/projects/{projectId:int}/activity")]
    public async Task<IActionResult> GetByProject(int projectId, [FromQuery] int limit = 20) =>
        Ok(await svc.GetByProjectAsync(projectId, limit));

    // 전역 활동 피드 — 모든 프로젝트 across, 시간순 페이지네이션. /activity 페이지가 호출.
    // 필터: projectId 단일값, entityType/action 콤마 구분 다중값, from/to ISO 날짜.
    [HttpGet("api/activity")]
    public async Task<IActionResult> GetAll(
        [FromQuery] int? projectId = null,
        [FromQuery] string? entityType = null,
        [FromQuery] string? action = null,
        [FromQuery] string? from = null,
        [FromQuery] string? to = null,
        [FromQuery] int limit = 100,
        [FromQuery] int offset = 0)
    {
        var filter = new ActivityFilter(
            projectId,
            SplitCsv(entityType),
            ParseActions(action),
            ParseDate(from),
            ParseDate(to),
            limit,
            offset);
        return Ok(await svc.GetAllAsync(filter));
    }

    private static IReadOnlyList<string>? SplitCsv(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var parts = raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return parts.Length == 0 ? null : parts;
    }

    private static IReadOnlyList<ActivityAction>? ParseActions(string? raw)
    {
        var parts = SplitCsv(raw);
        if (parts is null) return null;
        var list = new List<ActivityAction>(parts.Count);
        foreach (var p in parts)
        {
            // 잘못된 값은 무시 — 사용자가 손으로 URL 조작했을 가능성 정도, 500 으로 깨뜨릴 필요 없음.
            if (Enum.TryParse<ActivityAction>(p, ignoreCase: true, out var v))
                list.Add(v);
        }
        return list.Count == 0 ? null : list;
    }

    private static DateTime? ParseDate(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        if (DateTime.TryParseExact(raw, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var d))
            return d;
        return DateTime.TryParse(raw, CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var fallback)
            ? fallback : null;
    }
}
