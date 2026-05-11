using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

public record WbsItemDto(
    int Id, int ProjectId, int? VersionId, int? ParentId,
    string Name, string Assignee,
    DateTime? StartDate, DateTime? EndDate,
    WbsStatus Status, bool IsMilestone, int Order, string Notes,
    DateTime CreatedAt, DateTime UpdatedAt,
    IEnumerable<WbsItemDto>? Children);

public record CreateWbsItemDto(
    int ProjectId, int? VersionId, int? ParentId,
    string Name, string Assignee,
    DateTime? StartDate, DateTime? EndDate,
    WbsStatus Status, bool IsMilestone, int Order, string Notes);

public record UpdateWbsItemDto(
    string Name, string Assignee,
    DateTime? StartDate, DateTime? EndDate,
    WbsStatus Status, bool IsMilestone, int Order, string Notes);

public record WbsVersionDto(
    int Id, int ProjectId, string VersionName, string Description,
    DateTime CreatedAt, bool IsCurrent);

public record CreateWbsVersionDto(int ProjectId, string VersionName, string Description);
