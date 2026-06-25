using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;
using ProjectManager.Core.DTOs;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProjectsController(ProjectService svc) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(await svc.GetAllAsync());

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id) =>
        await svc.GetByIdAsync(id) is { } dto ? Ok(dto) : NotFound();

    [HttpGet("{id:int}/dashboard")]
    public async Task<IActionResult> GetDashboard(int id) =>
        await svc.GetDashboardAsync(id) is { } dto ? Ok(dto) : NotFound();

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateProjectDto dto)
    {
        var created = await svc.CreateAsync(dto);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateProjectDto dto) =>
        await svc.UpdateAsync(id, dto) is { } updated ? Ok(updated) : NotFound();

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) =>
        await svc.DeleteAsync(id) ? NoContent() : NotFound();

    // 이슈 리스트 커스텀 컬럼 정의 — raw JSON 배열 passthrough(프런트가 스키마 소유).
    // GET 은 배열을 그대로 반환(문자열 래핑 방지), PUT 은 JsonElement 로 유효성 검증 후 정규화 저장.
    [HttpGet("{id:int}/issue-columns")]
    public async Task<IActionResult> GetIssueColumns(int id) =>
        Content(await svc.GetIssueColumnsAsync(id), "application/json");

    [HttpPut("{id:int}/issue-columns")]
    public async Task<IActionResult> SetIssueColumns(int id, [FromBody] JsonElement body) =>
        await svc.SetIssueColumnsAsync(id, body.GetRawText()) ? NoContent() : NotFound();

    [HttpPost("{id:int}/backup")]
    public async Task<IActionResult> Backup(int id)
    {
        var result = await svc.CreateBackupAsync(id);
        if (result is null) return NotFound();
        return File(result.Value.Stream, "application/zip", result.Value.FileName);
    }

    // 백업 zip 안에 포함된 프로젝트 목록 미리보기 (사용자가 어느 프로젝트를 import 할지 선택).
    [HttpPost("import/preview")]
    public async Task<IActionResult> ImportPreview(IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { error = "백업 zip 파일이 비어 있습니다." });
        try
        {
            await using var stream = file.OpenReadStream();
            var items = await svc.ListImportPreviewAsync(stream, ct);
            if (items is null)
                return BadRequest(new { error = "백업 zip 안에서 db/projectmanager.db 를 찾을 수 없습니다." });
            return Ok(items);
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status415UnsupportedMediaType, new { error = ex.Message });
        }
        catch (InvalidDataException)
        {
            return BadRequest(new { error = "유효한 zip 파일이 아닙니다." });
        }
    }

    // 백업 zip 에서 지정된 sourceProjectId 한 개를 현재 DB 에 새 프로젝트로 머지.
    [HttpPost("import")]
    public async Task<IActionResult> Import(IFormFile file, [FromForm] int sourceProjectId, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { error = "백업 zip 파일이 비어 있습니다." });
        try
        {
            await using var stream = file.OpenReadStream();
            var result = await svc.ImportProjectAsync(stream, sourceProjectId, ct);
            if (result is null)
                return NotFound(new { error = $"백업 안에 ID {sourceProjectId} 프로젝트가 없습니다." });
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (InvalidDataException)
        {
            return BadRequest(new { error = "유효한 zip 파일이 아닙니다." });
        }
    }
}
