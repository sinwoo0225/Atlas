using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
[Route("api/start-page")]
public class StartPageController(StartPageService svc, IActorAccessor actor) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get() =>
        Ok(await svc.GetForActorAsync(actor.GetActor() ?? string.Empty));
}
