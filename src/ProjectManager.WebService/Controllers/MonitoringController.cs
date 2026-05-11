using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;

namespace ProjectManager.WebService.Controllers;

[ApiController]
[Route("api/monitoring")]
public class MonitoringController(MonitoringService svc) : ControllerBase
{
    [HttpGet("today")]
    public async Task<IActionResult> Today() => Ok(await svc.GetTodayAsync());
}
