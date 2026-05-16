using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;
using ProjectManager.Core.DTOs;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
[Route("api/issue-wbs-links")]
public class IssueWbsLinksController(IssueWbsLinkService svc) : ControllerBase
{
    [HttpGet("by-issue/{issueId:int}")]
    public async Task<IActionResult> GetByIssue(int issueId) =>
        Ok(await svc.GetByIssueAsync(issueId));

    [HttpGet("by-wbs/{wbsItemId:int}")]
    public async Task<IActionResult> GetByWbs(int wbsItemId) =>
        Ok(await svc.GetByWbsItemAsync(wbsItemId));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateIssueWbsLinkDto dto)
    {
        try { return Ok(await svc.CreateAsync(dto)); }
        catch (IssueWbsLinkConflictException ex) { return Conflict(new { error = ex.Message }); }
    }

    [HttpDelete("by-issue/{issueId:int}/by-wbs/{wbsItemId:int}")]
    public async Task<IActionResult> Delete(int issueId, int wbsItemId) =>
        await svc.DeleteAsync(issueId, wbsItemId) ? NoContent() : NotFound();
}
