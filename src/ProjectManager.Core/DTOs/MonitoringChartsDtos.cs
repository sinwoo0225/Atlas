using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

// 통합 모니터링 페이지 상단의 종합 시각화에 쓰는 집계 DTO들.

public record ProjectStatusBreakdownDto(
    int Planned, int Waiting, int InProgress, int Done);

public record IssueMatrixCellDto(
    IssueStatus Status, IssuePriority Priority, int Count);

public record UpcomingMilestoneDto(
    int WbsItemId, int ProjectId, string ProjectName,
    string Name, DateTime EndDate, WbsStatus Status);

public record WbsProgressDto(
    int ProjectId, string ProjectName, ProjectStatus ProjectStatus,
    int Total, int Done, double ProgressPercent);

public record MonitoringChartsDto(
    ProjectStatusBreakdownDto ProjectStatus,
    IEnumerable<IssueMatrixCellDto> IssueMatrix,
    IEnumerable<UpcomingMilestoneDto> UpcomingMilestones,
    IEnumerable<WbsProgressDto> WbsProgress);
