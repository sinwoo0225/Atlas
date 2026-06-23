using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;
using ProjectManager.Core.DTOs;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
[Route("api/wbs-dependencies")]
public class WbsDependenciesController(WbsDependencyService svc, SchedulingService scheduling) : ControllerBase
{
    [HttpGet("by-project/{projectId:int}")]
    public async Task<IActionResult> GetByProject(int projectId, [FromQuery] int? versionId = null) =>
        Ok(await svc.GetByProjectAsync(projectId, versionId));

    [HttpGet("by-wbs/{wbsItemId:int}")]
    public async Task<IActionResult> GetByWbs(int wbsItemId) =>
        Ok(await svc.GetByWbsItemAsync(wbsItemId));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateWbsDependencyDto dto)
    {
        try { return Ok(await svc.CreateAsync(dto)); }
        catch (WbsDependencyConflictException ex) { return Conflict(new { error = ex.Message }); }
    }

    [HttpDelete("by-pred/{predecessorId:int}/by-succ/{successorId:int}")]
    public async Task<IActionResult> Delete(int predecessorId, int successorId) =>
        await svc.DeleteAsync(predecessorId, successorId) ? NoContent() : NotFound();

    // 임계경로(CPM).
    [HttpGet("critical-path/{projectId:int}")]
    public async Task<IActionResult> CriticalPath(int projectId, [FromQuery] int? versionId = null, [FromQuery] bool skipWeekends = true) =>
        Ok(await scheduling.ComputeCriticalPathAsync(projectId, versionId, skipWeekends));

    // 자동 리스케줄 미리보기 — fromId 의 후행 push-only 이동(저장 안 함).
    [HttpGet("reschedule-preview/{projectId:int}/from/{fromWbsItemId:int}")]
    public async Task<IActionResult> ReschedulePreview(int projectId, int fromWbsItemId, [FromQuery] bool skipWeekends = true) =>
        Ok(await scheduling.PreviewRescheduleAsync(projectId, fromWbsItemId, skipWeekends));

    // 리스케줄 적용.
    [HttpPost("reschedule-apply/{projectId:int}")]
    public async Task<IActionResult> RescheduleApply(int projectId, [FromBody] RescheduleResultDto preview) =>
        Ok(await scheduling.ApplyRescheduleAsync(projectId, preview.Shifts, preview.SkipWeekends));
}
