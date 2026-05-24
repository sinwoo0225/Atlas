using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

public record IssueDto(
    int Id, int ProjectId, string Title, string Description,
    IssueStatus Status, IssuePriority Priority,
    int? AssigneeResourceId, string? AssigneeName,
    DateTime? DueDate, DateTime? OccurredOn, DateTime CreatedAt, DateTime UpdatedAt);

public record CreateIssueDto(
    int ProjectId, string Title, string Description,
    IssueStatus Status, IssuePriority Priority,
    int? AssigneeResourceId, DateTime? DueDate, DateTime? OccurredOn = null);

public record UpdateIssueDto(
    string Title, string Description,
    IssueStatus Status, IssuePriority Priority,
    int? AssigneeResourceId, DateTime? DueDate, DateTime? OccurredOn = null);
