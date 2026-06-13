using Microsoft.AspNetCore.Mvc;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.AppHost.Controllers;

// 독립 TODO CRUD + 통합 '내 업무(my-work)' 집계/완료. my-work 는 WBS/이슈/TODO 를 한 화면에 모은다.
[ApiController]
public class TodoController(TodoService todoSvc, WbsService wbsSvc, IssueService issueSvc) : ControllerBase
{
    [HttpGet("api/todos")]
    public async Task<IActionResult> List(
        [FromQuery] bool open = false,
        [FromQuery] int? assigneeResourceId = null,
        [FromQuery] string? keyword = null) =>
        Ok(await todoSvc.GetAllAsync(new TodoListFilter(
            Open: open, AssigneeResourceId: assigneeResourceId, Keyword: keyword)));

    [HttpGet("api/todos/{id:int}")]
    public async Task<IActionResult> Get(int id) =>
        await todoSvc.GetByIdAsync(id) is { } dto ? Ok(dto) : NotFound();

    [HttpPost("api/todos")]
    public async Task<IActionResult> Create([FromBody] CreateTodoItemDto dto)
    {
        var created = await todoSvc.CreateAsync(dto);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    [HttpPut("api/todos/{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateTodoItemDto dto) =>
        await todoSvc.UpdateAsync(id, dto) is { } updated ? Ok(updated) : NotFound();

    [HttpDelete("api/todos/{id:int}")]
    public async Task<IActionResult> Delete(int id) =>
        await todoSvc.DeleteAsync(id) ? NoContent() : NotFound();

    [HttpPost("api/todos/{id:int}/complete")]
    public async Task<IActionResult> Complete(int id) =>
        await todoSvc.CompleteAsync(id) ? NoContent() : NotFound();

    // 통합 '내 업무' — assigneeResourceId 생략 시 전체. 프론트는 설정의 myResourceId 를 전달.
    [HttpGet("api/my-work")]
    public async Task<IActionResult> MyWork([FromQuery] int? assigneeResourceId = null) =>
        Ok(await todoSvc.GetMyWorkAsync(assigneeResourceId));

    // 한 줄 완료 디스패치 — WBS→Done, 이슈→Resolved, TODO→완료(+반복 재생성).
    [HttpPost("api/my-work/complete")]
    public async Task<IActionResult> CompleteMyWork([FromBody] CompleteMyWorkDto dto)
    {
        var ok = dto.SourceType switch
        {
            "wbs" => await wbsSvc.SetStatusAsync(dto.Id, WbsStatus.Done),
            "issue" => await issueSvc.SetStatusAsync(dto.Id, IssueStatus.Resolved),
            "todo" => await todoSvc.CompleteAsync(dto.Id),
            _ => false,
        };
        return ok ? NoContent() : NotFound();
    }
}
