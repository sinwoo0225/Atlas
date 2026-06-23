using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;
using ProjectManager.Core.DTOs;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
[Route("api/projects/{projectId:int}/wbs")]
public class WbsController(WbsService svc) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(int projectId, [FromQuery] int? versionId) =>
        Ok(await svc.GetByProjectAsync(projectId, versionId));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int projectId, int id) =>
        await svc.GetByIdAsync(id) is { } dto ? Ok(dto) : NotFound();

    [HttpPost]
    public async Task<IActionResult> Create(int projectId, [FromBody] CreateWbsItemDto dto)
    {
        var created = await svc.CreateAsync(dto);
        return CreatedAtAction(nameof(GetById), new { projectId, id = created.Id }, created);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int projectId, int id, [FromBody] UpdateWbsItemDto dto)
    {
        try { return await svc.UpdateAsync(id, dto) is { } updated ? Ok(updated) : NotFound(); }
        catch (WbsInvalidParentException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int projectId, int id) =>
        await svc.DeleteAsync(id) ? NoContent() : NotFound();

    // 기준선 캡처 — 현재 계획 일정을 baseline 으로 박제(선택 시 버전 한정).
    [HttpPost("baseline/capture")]
    public async Task<IActionResult> CaptureBaseline(int projectId, [FromQuery] int? versionId) =>
        Ok(new { captured = await svc.CaptureBaselineAsync(projectId, versionId) });

    [HttpPost("baseline/clear")]
    public async Task<IActionResult> ClearBaseline(int projectId, [FromQuery] int? versionId) =>
        Ok(new { cleared = await svc.ClearBaselineAsync(projectId, versionId) });
}

[ApiController]
[Route("api/projects/{projectId:int}/wbs-versions")]
public class WbsVersionsController(WbsService svc) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(int projectId) =>
        Ok(await svc.GetVersionsAsync(projectId));

    [HttpPost]
    public async Task<IActionResult> Create(int projectId, [FromBody] CreateWbsVersionDto dto)
    {
        var created = await svc.CreateVersionAsync(dto);
        return CreatedAtAction(nameof(GetAll), new { projectId }, created);
    }

    [HttpPut("{versionId:int}/set-current")]
    public async Task<IActionResult> SetCurrent(int projectId, int versionId)
    {
        await svc.SetCurrentVersionAsync(projectId, versionId);
        return NoContent();
    }
}
