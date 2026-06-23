namespace ProjectManager.Core.DTOs;

// WbsItem 에 배정된 자원 + 배분율. ResourceName 은 표시용(navigation 채워 응답).
public record WbsAssignmentDto(
    int Id, int WbsItemId, int ResourceId, string ResourceName,
    int AllocationPercent);

// 명시적 배정/배분 편집 — 없으면 생성, 있으면 배분율 갱신(upsert).
public record UpsertWbsAssignmentDto(int ResourceId, int AllocationPercent);
