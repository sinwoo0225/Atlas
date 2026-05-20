using Microsoft.AspNetCore.Mvc;
using ProjectManager.Infrastructure.ExternalTools;

namespace ProjectManager.AppHost.Controllers;

// 로컬 Claude Code CLI(`claude -p`) 연동. 설정에서 옵트인한 경우에만 프론트가 호출.
// 상태 비저장 — 회의록 등 어떤 텍스트든 요약만 반환하고 DB 는 건드리지 않는다.
[ApiController]
[Route("api/ai")]
public class AiController(ClaudeCliService claude) : ControllerBase
{
    public record SummarizeRequest(string Text);

    // 설정의 "테스트" 버튼 — 바이너리+인증+출력 1회 왕복 확인.
    [HttpGet("claude-check")]
    public async Task<IActionResult> ClaudeCheck()
    {
        var r = await claude.CheckAsync();
        return Ok(new { available = r.Available, sample = r.Sample, error = r.Error });
    }

    // 논의내용 등 텍스트를 한국어로 요약.
    [HttpPost("summarize")]
    public async Task<IActionResult> Summarize([FromBody] SummarizeRequest req)
    {
        if (string.IsNullOrWhiteSpace(req?.Text))
            return BadRequest(new { error = "요약할 텍스트가 비어 있습니다." });
        try
        {
            var summary = await claude.SummarizeAsync(req.Text);
            return Ok(new { summary });
        }
        catch (Exception ex)
        {
            // claude 미설치/타임아웃/인증 실패 등 — 외부 도구 오류는 502 로.
            return StatusCode(502, new { error = ex.Message });
        }
    }
}
