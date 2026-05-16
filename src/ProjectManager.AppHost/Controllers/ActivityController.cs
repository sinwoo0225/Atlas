using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
[Route("api/projects/{projectId:int}/activity")]
public class ActivityController(ActivityLogService svc) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetByProject(int projectId, [FromQuery] int limit = 20) =>
        Ok(await svc.GetByProjectAsync(projectId, limit));
}
