using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

public record WbsItemDto(
    int Id, int ProjectId, int? VersionId, int? ParentId,
    string Name, string Assignee,
    DateTime? StartDate, DateTime? EndDate,
    WbsStatus Status, bool IsMilestone, int Importance, string Notes,
    DateTime CreatedAt, DateTime UpdatedAt,
    int SortOrder,
    // 실적 착수/완료 일자. ActualStartDate 는 InProgress 진입 시, CompletedDate 는 Done 진입 시 자동 스탬프.
    DateTime? ActualStartDate,
    DateTime? CompletedDate,
    // 공수 추정(시간, leaf 입력). RolledUpEstimateHours 는 부모 표시용 자손 leaf 합(계산값, 저장 안 함; leaf 면 EstimateHours 와 동일).
    double? EstimateHours,
    double? RolledUpEstimateHours,
    // 기준선 일정(캡처된 계획). Gantt 고스트 막대·variance 기준. null=기준선 없음.
    DateTime? BaselineStart,
    DateTime? BaselineEnd,
    // 서브태스크 진행률(완료/전체). 목록 배지·간트 % 표시용 — 항상 채움. Subtasks 는 상세/폼(GetById)에서만.
    int SubtaskTotal,
    int SubtaskDone,
    IEnumerable<WbsSubtaskDto>? Subtasks,
    IEnumerable<WbsItemDto>? Children);

// SortOrder 는 생성 시 백엔드가 자동 계산 (같은 startDate 그룹 max+1) → dto 제외.
public record CreateWbsItemDto(
    int ProjectId, int? VersionId, int? ParentId,
    string Name, string Assignee,
    DateTime? StartDate, DateTime? EndDate,
    WbsStatus Status, bool IsMilestone, int Importance, string Notes,
    DateTime? CompletedDate = null,
    double? EstimateHours = null,
    DateTime? ActualStartDate = null);

// SortOrder 는 dnd-kit reorder PUT 에서 클라가 새 값 전송. parentChanged 분기는 백엔드가 덮어씀.
public record UpdateWbsItemDto(
    int? ParentId,
    string Name, string Assignee,
    DateTime? StartDate, DateTime? EndDate,
    WbsStatus Status, bool IsMilestone, int Importance, string Notes,
    int SortOrder,
    DateTime? CompletedDate,
    DateTime UpdatedAt,
    double? EstimateHours = null,
    DateTime? ActualStartDate = null);

public record WbsVersionDto(
    int Id, int ProjectId, string VersionName, string Description,
    DateTime CreatedAt, bool IsCurrent);

public record CreateWbsVersionDto(int ProjectId, string VersionName, string Description);
