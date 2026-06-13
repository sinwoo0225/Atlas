using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

public record WbsItemDto(
    int Id, int ProjectId, int? VersionId, int? ParentId,
    string Name, string Assignee,
    DateTime? StartDate, DateTime? EndDate,
    WbsStatus Status, bool IsMilestone, int Importance, string Notes,
    DateTime CreatedAt, DateTime UpdatedAt,
    int SortOrder,
    DateTime? CompletedDate,
    IEnumerable<WbsItemDto>? Children);

// SortOrder 는 생성 시 백엔드가 자동 계산 (같은 startDate 그룹 max+1) → dto 제외.
public record CreateWbsItemDto(
    int ProjectId, int? VersionId, int? ParentId,
    string Name, string Assignee,
    DateTime? StartDate, DateTime? EndDate,
    WbsStatus Status, bool IsMilestone, int Importance, string Notes,
    DateTime? CompletedDate = null);

// SortOrder 는 dnd-kit reorder PUT 에서 클라가 새 값 전송. parentChanged 분기는 백엔드가 덮어씀.
public record UpdateWbsItemDto(
    int? ParentId,
    string Name, string Assignee,
    DateTime? StartDate, DateTime? EndDate,
    WbsStatus Status, bool IsMilestone, int Importance, string Notes,
    int SortOrder,
    DateTime? CompletedDate,
    DateTime UpdatedAt);

public record WbsVersionDto(
    int Id, int ProjectId, string VersionName, string Description,
    DateTime CreatedAt, bool IsCurrent);

public record CreateWbsVersionDto(int ProjectId, string VersionName, string Description);
