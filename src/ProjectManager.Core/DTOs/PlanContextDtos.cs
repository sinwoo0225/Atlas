namespace ProjectManager.Core.DTOs;

// 일정 계획 진단 1건 — 에이전트가 리스케줄/재배분 결정에 쓰는 신호.
// Kind: overdue | dependency_violation.
public record PlanDiagnosticDto(string Kind, int? WbsItemId, string Detail);

// 용량인지 계획 컨텍스트 번들 — 프로젝트의 작업·의존성·배정·자원·임계경로·진단을 한 번에.
// 에이전트가 리스케줄/배분을 추론하는 핵심(여러 list 콜 대체). wbs context 의 일정 계획 버전.
public record PlanContextDto(
    ProjectDto Project,
    IReadOnlyList<WbsItemDto> Tasks,
    IReadOnlyList<WbsDependencyDto> Dependencies,
    IReadOnlyList<WbsAssignmentDto> Allocations,
    IReadOnlyList<ResourceDto> Resources,
    CriticalPathDto? CriticalPath,
    IReadOnlyList<PlanDiagnosticDto> Diagnostics);
