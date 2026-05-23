using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProjectManager.Application.Services;
using ProjectManager.Core.DTOs;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
[Route("api/wbs-templates")]
public class WbsTemplatesController(WbsTemplateService svc) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(await svc.ListAsync());

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id) =>
        await svc.GetAsync(id, null) is { } dto ? Ok(dto) : NotFound();

    [HttpGet("builtin/{key}")]
    public async Task<IActionResult> GetBuiltin(string key) =>
        await svc.GetAsync(null, key) is { } dto ? Ok(dto) : NotFound();

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateWbsTemplateDto dto)
    {
        var created = await svc.CreateAsync(dto);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateWbsTemplateDto dto)
    {
        try { return await svc.UpdateAsync(id, dto) is { } updated ? Ok(updated) : NotFound(); }
        catch (DbUpdateConcurrencyException) { return Conflict(new { error = "다른 곳에서 먼저 수정되었습니다. 새로고침 후 다시 시도하세요." }); }
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) =>
        await svc.DeleteAsync(id) ? NoContent() : NotFound();

    [HttpPost("from-project")]
    public async Task<IActionResult> CreateFromProject([FromBody] CreateTemplateFromProjectDto dto)
    {
        try
        {
            var created = await svc.CreateFromProjectAsync(dto);
            return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
        }
        catch (WbsTemplateException ex) { return BadRequest(new { error = ex.Message }); }
    }
}

[ApiController]
[Route("api/projects/{projectId:int}/wbs")]
public class WbsTemplateApplyController(WbsTemplateService svc) : ControllerBase
{
    [HttpPost("apply-template")]
    public async Task<IActionResult> Apply(int projectId, [FromBody] ApplyTemplateDto dto)
    {
        try { return await svc.ApplyAsync(projectId, dto) is { } result ? Ok(result) : NotFound(); }
        catch (WbsTemplateException ex) { return BadRequest(new { error = ex.Message }); }
    }
}
