using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

public record WbsDependencyDto(
    int Id, int PredecessorId, int SuccessorId,
    string? PredecessorName, string? SuccessorName,
    WbsDependencyType Type, int LagDays);

public record CreateWbsDependencyDto(
    int PredecessorId, int SuccessorId,
    WbsDependencyType Type = WbsDependencyType.FinishToStart, int LagDays = 0);

// CPM 결과(작업 1건). 부동(float)≤0 이면 임계. Indeterminate=날짜 부족으로 계산 제외.
public record CriticalPathItemDto(
    int WbsItemId, bool IsCritical, double? TotalFloatDays,
    DateTime? EarlyStart, DateTime? EarlyFinish, DateTime? LateStart, DateTime? LateFinish,
    bool Indeterminate);

public record CriticalPathDto(
    DateTime? ProjectStart, DateTime? ProjectFinish, bool HasCycle,
    IReadOnlyList<int> CriticalPath,
    IReadOnlyList<CriticalPathItemDto> Items);

// 리스케줄 1건 이동(미리보기/적용 공용). Delta = 종료일 이동 일수.
public record RescheduleShiftDto(
    int WbsItemId, string Name,
    DateTime? OldStart, DateTime? OldEnd,
    DateTime? NewStart, DateTime? NewEnd,
    int DeltaDays);

public record RescheduleResultDto(
    int FromWbsItemId, bool SkipWeekends,
    IReadOnlyList<RescheduleShiftDto> Shifts);
