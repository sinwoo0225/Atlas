using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;

namespace ProjectManager.AppHost.Controllers;

// 프로젝트에 연결된 소스 저장소(.git)의 읽기 전용 git 이력·동기화 상태.
// 백엔드가 도는 머신의 파일시스템만 읽으므로 사실상 Local 모드 전용 (Client 모드는 프론트에서 안내).
[ApiController]
[Route("api/projects/{projectId:int}/git")]
public class GitController(GitHistoryService svc) : ControllerBase
{
    // 저장소 미설정/무효도 200 으로 상태 객체를 돌려준다 (프론트가 안내 UI 분기).
    [HttpGet("status")]
    public async Task<IActionResult> Status(int projectId) =>
        Ok(await svc.GetStatusAsync(projectId));

    [HttpGet("log")]
    public async Task<IActionResult> Log(
        int projectId,
        [FromQuery] int limit = 200,
        [FromQuery] int skip = 0,
        [FromQuery] bool all = false)
    {
        try
        {
            return Ok(await svc.GetLogAsync(projectId, limit, skip, all));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    // 폼에서 경로 저장 전 .git 유효성 확인.
    [HttpGet("validate")]
    public async Task<IActionResult> Validate([FromQuery] string path)
    {
        var (valid, error) = await svc.ValidateAsync(path ?? string.Empty);
        return Ok(new { valid, error });
    }
}
