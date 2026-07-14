using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

public record WbsItemDto(
    int Id, int ProjectId, int? VersionId, int? ParentId,
    string Name, string Assignee,
    DateTime? StartDate, DateTime? EndDate,
    WbsStatus Status,
    // 역할. Group = 순수 그루핑(모든 지표에서 제외, 표시는 자손 Task 에서 파생). Task = 1급 작업(자식이 있어도 자기가 1건).
    WbsKind Kind,
    bool IsMilestone, int Importance, string Notes,
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
    IEnumerable<WbsItemDto>? Children,
    // --- 아래는 파생값(계산, 저장 안 함). 자손 Task 에서 롤업한다. ---
    // 트리 조회(GetByProject)에서만 채운다 — GetById 는 자식을 1단계만 로드하고 QueryAsync 는 평면이라 자손을 모른다.
    // 그 경로들에선 null/0 (Children 을 null 로 두는 것과 같은 원칙).
    int ChildCount = 0,
    // Group 은 이 값들로 표시하고(자기 Status 는 무시), Task 는 '자식 진행' 보조 배지로 쓴다. 자손 Task 가 없으면 전부 null.
    WbsStatus? RollupStatus = null,
    double? RollupProgress = null,   // 0~1
    DateTime? RollupStart = null,
    DateTime? RollupEnd = null);

// SortOrder 는 생성 시 백엔드가 자동 계산 (같은 startDate 그룹 max+1) → dto 제외.
public record CreateWbsItemDto(
    int ProjectId, int? VersionId, int? ParentId,
    string Name, string Assignee,
    DateTime? StartDate, DateTime? EndDate,
    WbsStatus Status, bool IsMilestone, int Importance, string Notes,
    DateTime? CompletedDate = null,
    double? EstimateHours = null,
    DateTime? ActualStartDate = null,
    WbsKind Kind = WbsKind.Task);

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
    DateTime? ActualStartDate = null,
    // ⚠️ nullable = '미변경'. 이 DTO 의 다른 필드는 전체 교체(replace) 규약인데 Kind 만 의도적으로 예외다.
    // non-nullable 로 두면 kind 를 안 싣는 호출 — reorder PUT, 칸반 드롭, 일괄 이동, CLI/MCP 부분 갱신 —
    // 이 모든 Group 을 조용히 Task 로 강등시켜 전 지표를 오염시킨다. 그 사고를 타입으로 막는다.
    WbsKind? Kind = null);

public record WbsVersionDto(
    int Id, int ProjectId, string VersionName, string Description,
    DateTime CreatedAt, bool IsCurrent);

public record CreateWbsVersionDto(int ProjectId, string VersionName, string Description);
