using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;
using ProjectManager.Core.DTOs;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ResourcesController(ResourceService svc) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(await svc.GetAllAsync());

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id) =>
        await svc.GetByIdAsync(id) is { } dto ? Ok(dto) : NotFound();

    [HttpGet("{id:int}/assignments")]
    public async Task<IActionResult> GetAssignments(int id) =>
        Ok(await svc.GetAssignmentsAsync(id));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateResourceDto dto)
    {
        var created = await svc.CreateAsync(dto);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    // '나' 신원 통일 — 이름으로 Person 리소스를 찾고 없으면 생성해 반환(멱등). 설정의 '내 이름' 저장에서 호출.
    [HttpPost("resolve")]
    public async Task<IActionResult> Resolve([FromBody] ResolveResourceDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest(new { error = "name 이 비어 있습니다." });
        return Ok(await svc.GetOrCreateByNameAsync(dto.Name));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateResourceDto dto) =>
        await svc.UpdateAsync(id, dto) is { } updated ? Ok(updated) : NotFound();

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) =>
        await svc.DeleteAsync(id) ? NoContent() : NotFound();
}
