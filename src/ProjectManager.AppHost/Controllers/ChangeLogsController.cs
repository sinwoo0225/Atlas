using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;
using ProjectManager.Core.DTOs;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
[Route("api/projects/{projectId:int}/changelogs")]
public class ChangeLogsController(ChangeLogService svc) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(int projectId) =>
        Ok(await svc.GetByProjectAsync(projectId));

    // 역방향 카운트 — Issue/WBS 행 배지용 (lite shape: 두 dictionary).
    [HttpGet("source-counts")]
    public async Task<IActionResult> GetSourceCounts(int projectId) =>
        Ok(await svc.GetSourceCountsAsync(projectId));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int projectId, int id) =>
        await svc.GetByIdAsync(id) is { } dto ? Ok(dto) : NotFound();

    [HttpPost]
    public async Task<IActionResult> Create(int projectId, [FromBody] CreateChangeLogDto dto)
    {
        var created = await svc.CreateAsync(dto);
        return CreatedAtAction(nameof(GetById), new { projectId, id = created.Id }, created);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int projectId, int id, [FromBody] UpdateChangeLogDto dto) =>
        await svc.UpdateAsync(id, dto) is { } updated ? Ok(updated) : NotFound();

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int projectId, int id) =>
        await svc.DeleteAsync(id) ? NoContent() : NotFound();

    // 즐겨찾기(별표) 토글 — 목록 최상단 고정.
    [HttpPatch("{id:int}/favorite")]
    public async Task<IActionResult> SetFavorite(int projectId, int id, [FromBody] SetFavoriteDto dto) =>
        await svc.SetFavoriteAsync(id, dto.Favorite) ? NoContent() : NotFound();
}
