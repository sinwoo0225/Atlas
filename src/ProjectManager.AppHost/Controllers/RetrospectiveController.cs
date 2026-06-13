using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;

namespace ProjectManager.AppHost.Controllers;

// 프로젝트 회고 — 완료 프로젝트 다중 선택 비교 분석(순수 조회).
[ApiController]
[Route("api/retrospective")]
public class RetrospectiveController(RetrospectiveService svc) : ControllerBase
{
    // GET /api/retrospective?projectIds=1,2,3 — 최대 8개로 제한.
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? projectIds)
    {
        var ids = (projectIds ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => int.TryParse(s, out var n) ? n : (int?)null)
            .Where(n => n.HasValue)
            .Select(n => n!.Value)
            .Distinct()
            .Take(8)
            .ToList();
        return Ok(await svc.GetComparisonAsync(ids));
    }
}
