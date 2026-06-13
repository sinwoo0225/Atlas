using System.ComponentModel;
using ModelContextProtocol.Server;
using ProjectManager.Application.Output;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Mcp.Tools;

[McpServerToolType]
public static class TodoTools
{
    [McpServerTool(Name = "atlas_todo_list"),
     Description("독립 TODO(프로젝트 무관) 조회. open=true 면 미완만, assigneeResourceId 로 담당자 필터.")]
    public static async Task<string> List(
        TodoService svc,
        [Description("미완(Open)만")] bool open = false,
        [Description("담당자 Resource ID")] int? assigneeResourceId = null,
        [Description("제목·메모 부분일치")] string? keyword = null) =>
        McpJson.Serialize(await svc.GetAllAsync(new TodoListFilter(
            Open: open, AssigneeResourceId: assigneeResourceId, Keyword: keyword)));

    [McpServerTool(Name = "atlas_todo_get"), Description("단일 TODO 조회")]
    public static async Task<string> Get(TodoService svc, int id)
    {
        var dto = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"Todo {id} 없음");
        return McpJson.Serialize(dto);
    }

    [McpServerTool(Name = "atlas_todo_create"),
     Description("독립 TODO 생성. recurrence(None|Daily|Weekly|Monthly|Yearly) 지정 시 완료할 때 다음 회차 자동 생성.")]
    public static async Task<string> Create(
        TodoService svc,
        [Description("제목")] string title,
        [Description("메모")] string? notes = null,
        [Description("담당자 Resource ID")] int? assigneeResourceId = null,
        [Description("마감일 YYYY-MM-DD")] DateTime? dueDate = null,
        [Description("Open|Done (기본 Open)")] TodoStatus? status = null,
        [Description("None|Daily|Weekly|Monthly|Yearly (기본 None)")] TodoRecurrence? recurrence = null,
        [Description("반복 간격(N 주기마다, 기본 1)")] int? recurrenceInterval = null) =>
        McpJson.Serialize(await svc.CreateAsync(new CreateTodoItemDto(
            Title: title,
            Notes: notes ?? string.Empty,
            AssigneeResourceId: assigneeResourceId,
            DueDate: dueDate,
            Status: status ?? TodoStatus.Open,
            Recurrence: recurrence ?? TodoRecurrence.None,
            RecurrenceInterval: recurrenceInterval ?? 1)));

    [McpServerTool(Name = "atlas_todo_update"),
     Description("TODO 부분 갱신 — null 인 필드는 기존 값 유지")]
    public static async Task<string> Update(
        TodoService svc, int id,
        string? title = null, string? notes = null,
        int? assigneeResourceId = null, DateTime? dueDate = null,
        TodoStatus? status = null, DateTime? completedDate = null,
        TodoRecurrence? recurrence = null, int? recurrenceInterval = null,
        int? sortOrder = null)
    {
        var existing = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"Todo {id} 없음");
        return McpJson.Serialize(await svc.UpdateAsync(id, new UpdateTodoItemDto(
            Title: title ?? existing.Title,
            Notes: notes ?? existing.Notes,
            AssigneeResourceId: assigneeResourceId ?? existing.AssigneeResourceId,
            DueDate: dueDate ?? existing.DueDate,
            Status: status ?? existing.Status,
            CompletedDate: completedDate ?? existing.CompletedDate,
            Recurrence: recurrence ?? existing.Recurrence,
            RecurrenceInterval: recurrenceInterval ?? existing.RecurrenceInterval,
            SortOrder: sortOrder ?? existing.SortOrder,
            UpdatedAt: existing.UpdatedAt)));
    }

    [McpServerTool(Name = "atlas_todo_complete"),
     Description("TODO 완료 처리(멱등). 반복 TODO 면 다음 회차를 자동 생성.")]
    public static async Task<string> Complete(TodoService svc, int id)
    {
        if (!await svc.CompleteAsync(id))
            throw new InvalidOperationException($"Todo {id} 없음");
        return McpJson.Serialize(new { completed = true, id });
    }

    [McpServerTool(Name = "atlas_todo_delete"), Description("TODO 삭제")]
    public static async Task<string> Delete(TodoService svc, int id)
    {
        if (!await svc.DeleteAsync(id))
            throw new InvalidOperationException($"Todo {id} 없음");
        return McpJson.Serialize(new { deleted = true, id });
    }

    [McpServerTool(Name = "atlas_my_work"),
     Description("통합 '내 업무' — 내게 할당된 미완 WBS + 미해결 이슈 + 미완 독립 TODO 를 한 리스트로. " +
                 "assigneeResourceId 생략 시 전체. SourceType(wbs|issue|todo)·ProjectName·DueDate 포함.")]
    public static async Task<string> MyWork(
        TodoService svc,
        [Description("담당자 Resource ID (생략 시 전체)")] int? assigneeResourceId = null) =>
        McpJson.Serialize(await svc.GetMyWorkAsync(assigneeResourceId));
}
