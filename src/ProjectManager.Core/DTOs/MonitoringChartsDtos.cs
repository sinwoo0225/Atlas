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

// D-1 리소스 히트맵: across-project 담당자 × 8주 마감 밀도.
// WeekStarts 길이 8 (월요일 시작 ISO), Rows[i].Counts 길이 8.
public record ResourceHeatmapDto(
    IReadOnlyList<string> WeekStarts,
    IReadOnlyList<ResourceHeatmapRow> Rows,
    int TotalItems);

public record ResourceHeatmapRow(
    string Assignee,
    int[] Counts,
    IReadOnlyList<ResourceHeatmapItem> Items);

public record ResourceHeatmapItem(
    int WeekIndex,
    string Kind, // "wbs" | "issue"
    int Id,
    int ProjectId,
    string ProjectName,
    string Title,
    string DueDate);
