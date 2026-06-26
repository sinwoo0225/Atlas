using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;
using ProjectManager.Core.DTOs;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
[Route("api/projects/{projectId:int}/issues")]
public class IssuesController(IssueService svc) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(int projectId) =>
        Ok(await svc.GetByProjectAsync(projectId));

    // 분류 자동완성 후보 — 프로젝트 안 distinct Category (DevInfo tags 와 동일 패턴).
    [HttpGet("categories")]
    public async Task<IActionResult> GetCategories(int projectId, [FromQuery] string? sort = null) =>
        Ok(await svc.GetDistinctCategoriesAsync(projectId, sort));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int projectId, int id) =>
        await svc.GetByIdAsync(id) is { } dto ? Ok(dto) : NotFound();

    [HttpPost]
    public async Task<IActionResult> Create(int projectId, [FromBody] CreateIssueDto dto)
    {
        var created = await svc.CreateAsync(dto);
        return CreatedAtAction(nameof(GetById), new { projectId, id = created.Id }, created);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int projectId, int id, [FromBody] UpdateIssueDto dto) =>
        await svc.UpdateAsync(id, dto) is { } updated ? Ok(updated) : NotFound();

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int projectId, int id) =>
        await svc.DeleteAsync(id) ? NoContent() : NotFound();

    // 즐겨찾기(별표) 토글 — 목록 최상단 고정.
    [HttpPatch("{id:int}/favorite")]
    public async Task<IActionResult> SetFavorite(int projectId, int id, [FromBody] SetFavoriteDto dto) =>
        await svc.SetFavoriteAsync(id, dto.Favorite) ? NoContent() : NotFound();
}
