using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
public class ActivityController(ActivityLogService svc) : ControllerBase
{
    // 프로젝트별 활동 피드 — Dashboard 의 "최근 활동" 위젯이 호출.
    [HttpGet("api/projects/{projectId:int}/activity")]
    public async Task<IActionResult> GetByProject(int projectId, [FromQuery] int limit = 20) =>
        Ok(await svc.GetByProjectAsync(projectId, limit));

    // 전역 활동 피드 — 모든 프로젝트 across, 시간순 페이지네이션. /activity 페이지가 호출.
    [HttpGet("api/activity")]
    public async Task<IActionResult> GetAll([FromQuery] int limit = 100, [FromQuery] int offset = 0) =>
        Ok(await svc.GetAllAsync(limit, offset));
}
