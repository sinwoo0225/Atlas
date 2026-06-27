using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

// Category: 분류(단일 자유 입력값). CustomFieldsJson: 사용자 정의 커스텀 컬럼 값 맵(JSON-in-TEXT, 서버 passthrough).
// 신규 필드는 끝에 append — IssueDto 의 positional 생성자 호출부(IssueService.ToDto, ProjectService.IssueToDto) 깨짐 최소화.
public record IssueDto(
    int Id, int ProjectId, string Title, string Description,
    IssueStatus Status, IssuePriority Priority,
    int? AssigneeResourceId, string? AssigneeName,
    DateTime? DueDate, DateTime? OccurredOn, DateTime CreatedAt, DateTime UpdatedAt,
    DateTime? ResolvedDate = null, string Category = "", string CustomFieldsJson = "",
    bool IsFavorite = false, int SequenceNumber = 0);

public record CreateIssueDto(
    int ProjectId, string Title, string Description,
    IssueStatus Status, IssuePriority Priority,
    int? AssigneeResourceId, DateTime? DueDate, DateTime? OccurredOn = null,
    DateTime? ResolvedDate = null, string? Category = null, string? CustomFieldsJson = null);

public record UpdateIssueDto(
    string Title, string Description,
    IssueStatus Status, IssuePriority Priority,
    int? AssigneeResourceId, DateTime? DueDate, DateTime? OccurredOn = null,
    DateTime? ResolvedDate = null, string? Category = null, string? CustomFieldsJson = null);
