using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Search;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
[Route("api/search")]
public class SearchController(SearchService search, AppDbContext db) : ControllerBase
{
    // GET /api/search?q=...&types=Issue,WbsItem&projectId=1&limit=50
    [HttpGet]
    public async Task<IActionResult> Search(
        [FromQuery] string? q,
        [FromQuery] string? types,
        [FromQuery] int? projectId,
        [FromQuery] int limit = 50,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(q)) return Ok(Array.Empty<object>());
        var typeArr = string.IsNullOrWhiteSpace(types)
            ? null
            : types.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var hits = await search.SearchAsync(db, q, typeArr, projectId, limit, ct);
        return Ok(hits);
    }

    // POST /api/search/rebuild — 색인이 비었거나 드리프트가 의심될 때 사용. 운영자/사용자 트리거.
    [HttpPost("rebuild")]
    public async Task<IActionResult> Rebuild(CancellationToken ct = default)
    {
        var count = await search.RebuildAllAsync(db, ct);
        return Ok(new { rebuilt = count });
    }
}
