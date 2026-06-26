using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Infrastructure.FileStorage;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
[Route("api/projects/{projectId:int}/devinfo")]
public class DevInfoController(DevInfoService svc, DevFilesStorage storage, GitHistoryService git) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(int projectId) =>
        Ok(await svc.GetByProjectAsync(projectId));

    [HttpGet("tags")]
    public async Task<IActionResult> GetTags(int projectId, [FromQuery] string? sort = null) =>
        Ok(await svc.GetDistinctTagsAsync(projectId, sort));

    public record RenameTagRequest(string OldName, string NewName);
    public record MergeTagsRequest(List<string> Sources, string Target);

    [HttpPost("tags/rename")]
    public async Task<IActionResult> RenameTag(int projectId, [FromBody] RenameTagRequest req)
    {
        var n = await svc.RenameTagAsync(projectId, req.OldName, req.NewName);
        return Ok(new { changed = n });
    }

    [HttpPost("tags/merge")]
    public async Task<IActionResult> MergeTags(int projectId, [FromBody] MergeTagsRequest req)
    {
        var n = await svc.MergeTagsAsync(projectId, req.Sources, req.Target);
        return Ok(new { changed = n });
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int projectId, int id) =>
        await svc.GetByIdAsync(id) is { } dto ? Ok(dto) : NotFound();

    [HttpPost]
    public async Task<IActionResult> Create(int projectId, [FromBody] CreateDevInfoItemDto dto)
    {
        var created = await svc.CreateAsync(dto);
        return CreatedAtAction(nameof(GetById), new { projectId, id = created.Id }, created);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int projectId, int id, [FromBody] UpdateDevInfoItemDto dto) =>
        await svc.UpdateAsync(id, dto) is { } updated ? Ok(updated) : NotFound();

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int projectId, int id) =>
        await svc.DeleteAsync(id) ? NoContent() : NotFound();

    // 즐겨찾기(별표) 토글 — 목록 최상단 고정.
    [HttpPatch("{id:int}/favorite")]
    public async Task<IActionResult> SetFavorite(int projectId, int id, [FromBody] SetFavoriteDto dto) =>
        await svc.SetFavoriteAsync(id, dto.Favorite) ? NoContent() : NotFound();

    [HttpPost("{id:int}/open")]
    public async Task<IActionResult> OpenFile(int projectId, int id)
    {
        var item = await svc.GetByIdAsync(id);
        if (item is null) return NotFound();
        if (string.IsNullOrEmpty(item.FilePath)) return BadRequest("No file path");
        try { svc.OpenFile(item.FilePath); return Ok(); }
        catch (FileNotFoundException ex) { return NotFound(ex.Message); }
    }

    [HttpGet("{id:int}/preview")]
    public async Task<IActionResult> Preview(int projectId, int id)
    {
        var item = await svc.GetByIdAsync(id);
        if (item?.FilePath is not { Length: > 0 } path) return NotFound();
        if (!System.IO.File.Exists(path)) return NotFound();
        var ext = Path.GetExtension(path).ToLowerInvariant();
        var imageExts = new[] { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp" };
        var textExts = new[] { ".txt", ".md", ".json", ".csv", ".xml", ".yaml", ".yml", ".log" };
        if (imageExts.Contains(ext))
        {
            var mime = ext == ".jpg" ? "image/jpeg" : $"image/{ext.TrimStart('.')}";
            return PhysicalFile(path, mime);
        }
        if (textExts.Contains(ext))
        {
            var content = await System.IO.File.ReadAllTextAsync(path);
            return Ok(new { text = content });
        }
        return StatusCode(415);
    }

    [HttpPost("upload")]
    [DisableRequestSizeLimit]
    public async Task<IActionResult> Upload(int projectId, IFormFile file, [FromQuery] string projectFolder)
    {
        using var stream = file.OpenReadStream();
        var path = await storage.SaveFileAsync(projectFolder, file.FileName, stream);
        return Ok(new { filePath = path });
    }

    // ── GitRepo 타입 업무 정보의 읽기 전용 git 이력 ──
    // 저장소 경로는 항목(FilePath)에서 해석 — 클라이언트가 임의 경로를 넘길 수 없어 주입 위험 없음.
    // 항목이 이 프로젝트 소속이고 GitRepo 타입일 때만. 백엔드 머신 파일시스템만 읽으므로 사실상 Local 모드 전용.
    [HttpGet("{id:int}/git/status")]
    public async Task<IActionResult> GitStatus(int projectId, int id)
    {
        var item = await svc.GetByIdAsync(id);
        if (item is null || item.ProjectId != projectId || item.Type != DevInfoType.GitRepo)
            return NotFound();
        return Ok(await git.GetStatusByPathAsync(item.FilePath));
    }

    [HttpGet("{id:int}/git/log")]
    public async Task<IActionResult> GitLog(
        int projectId, int id,
        [FromQuery] int limit = 200,
        [FromQuery] int skip = 0,
        [FromQuery] bool all = false)
    {
        var item = await svc.GetByIdAsync(id);
        if (item is null || item.ProjectId != projectId || item.Type != DevInfoType.GitRepo)
            return NotFound();
        try
        {
            return Ok(await git.GetLogByPathAsync(item.FilePath, limit, skip, all));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    // 폼에서 GitRepo 경로 저장 전 .git 유효성 확인 (id 불필요 — 아직 미저장 경로).
    [HttpGet("git/validate")]
    public async Task<IActionResult> GitValidate(int projectId, [FromQuery] string path)
    {
        var (valid, error) = await git.ValidateAsync(path ?? string.Empty);
        return Ok(new { valid, error });
    }
}

[ApiController]
[Route("api")]
public class HealthController : ControllerBase
{
    [HttpGet("health")]
    public IActionResult Health() => Ok(new { status = "ok", time = DateTime.UtcNow });
}
