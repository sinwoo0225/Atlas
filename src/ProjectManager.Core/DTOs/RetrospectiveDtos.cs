using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

// 프로젝트 회고 — 완료 프로젝트 다중 선택 비교. 순수 조회(영속 엔티티 없음).
public record RetrospectiveDto(IReadOnlyList<ProjectRetrospectiveDto> Projects);

public record ProjectRetrospectiveDto(
    int ProjectId, string ProjectName, ProjectStatus Status,
    DateTime? PlannedStart, DateTime? PlannedEnd, DateTime? ActualCompletion,
    // 프로젝트 단위 지연 — (실제완료 - 계획종료) 일수, 계획기간 대비 비율.
    double? ScheduleDelayDays, double? ScheduleDelayRatio,
    // WBS(리프·비마일스톤) 완료/지연.
    int WbsTotal, int WbsDone, int WbsLatePastPlannedEnd, double WbsLateRatio,
    // 착수 실적 — 시작 편차(실제착수-계획시작, 일), 정시 착수율(계획시작 이내 착수 비율), 사이클타임(착수→완료, 일), 착수 표본 수.
    double? AvgStartVarianceDays, double? OnTimeStartRatio, double? AvgCycleTimeDays, int StartedCount,
    // 이슈 발생.
    int IssuesTotal, int IssuesHigh, int IssuesMedium, int IssuesLow,
    double? IssueDensity, double? AvgResolutionDays, int ResolutionSampleCount,
    // 번업 S곡선 — x=계획기간 경과%, y=누적 완료%.
    IReadOnlyList<SCurvePointDto> BurnUp);

public record SCurvePointDto(double ElapsedPct, double DonePct);
