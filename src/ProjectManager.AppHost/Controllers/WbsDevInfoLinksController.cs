using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;
using ProjectManager.Core.DTOs;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
[Route("api/wbs-devinfo-links")]
public class WbsDevInfoLinksController(WbsDevInfoLinkService svc) : ControllerBase
{
    [HttpGet("by-wbs/{wbsItemId:int}")]
    public async Task<IActionResult> GetByWbs(int wbsItemId) =>
        Ok(await svc.GetByWbsItemAsync(wbsItemId));

    [HttpGet("by-devinfo/{devInfoItemId:int}")]
    public async Task<IActionResult> GetByDevInfo(int devInfoItemId) =>
        Ok(await svc.GetByDevInfoAsync(devInfoItemId));

    // 카운트 배지용 — 프로젝트의 모든 link tuple (경량 DTO).
    [HttpGet("by-project/{projectId:int}")]
    public async Task<IActionResult> GetByProject(int projectId) =>
        Ok(await svc.GetByProjectAsync(projectId));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateWbsDevInfoLinkDto dto)
    {
        try { return Ok(await svc.CreateAsync(dto)); }
        catch (WbsDevInfoLinkConflictException ex) { return Conflict(new { error = ex.Message }); }
    }

    [HttpDelete("by-wbs/{wbsItemId:int}/by-devinfo/{devInfoItemId:int}")]
    public async Task<IActionResult> Delete(int wbsItemId, int devInfoItemId) =>
        await svc.DeleteAsync(wbsItemId, devInfoItemId) ? NoContent() : NotFound();
}
