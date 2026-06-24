using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

public record TodoItemDto(
    int Id, string Title, string Notes,
    int? AssigneeResourceId, string? AssigneeName,
    DateTime? DueDate, TodoStatus Status, DateTime? CompletedDate,
    TodoRecurrence Recurrence, int RecurrenceInterval, int SortOrder,
    DateTime CreatedAt, DateTime UpdatedAt);

public record CreateTodoItemDto(
    string Title, string Notes = "",
    int? AssigneeResourceId = null, DateTime? DueDate = null,
    TodoStatus Status = TodoStatus.Open, DateTime? CompletedDate = null,
    TodoRecurrence Recurrence = TodoRecurrence.None, int RecurrenceInterval = 1);

public record UpdateTodoItemDto(
    string Title, string Notes,
    int? AssigneeResourceId, DateTime? DueDate,
    TodoStatus Status, DateTime? CompletedDate,
    TodoRecurrence Recurrence, int RecurrenceInterval, int SortOrder,
    DateTime UpdatedAt);

// 통합 '내 업무(my-work)' 한 줄 — WBS/이슈/독립 TODO 를 한 리스트로 합친다.
// SourceType: "wbs" | "issue" | "todo". ProjectId/ProjectName 은 독립 TODO 면 null.
// Priority 는 이슈만, Importance 는 WBS 만, Recurrence 는 TODO 만 채워진다(나머지 null).
public record MyWorkItemDto(
    string SourceType, int Id, int? ProjectId, string? ProjectName,
    string Title, string Status, string? Priority, int? Importance,
    DateTime? DueDate, DateTime? CompletedDate, string? Recurrence);

public record MyWorkDto(IReadOnlyList<MyWorkItemDto> Items);

// '내 업무' 한 줄 완료 처리 — SourceType 별로 WBS/이슈/TODO 완료 디스패치.
public record CompleteMyWorkDto(string SourceType, int Id);
