using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

// 통합 모니터링 페이지 상단의 종합 시각화에 쓰는 집계 DTO들.

public record ProjectStatusBreakdownDto(
    int Planned, int Waiting, int InProgress, int Done);

// 상태 분포 위젯의 우측 리스트 — 도넛 옆에 프로젝트별 진행률·마감 표시.
// progressPercent 는 WBS 진행률과 동일 계산 (마일스톤 제외, total 0 이면 0).
public record ProjectStatusItemDto(
    int ProjectId, string ProjectName, ProjectStatus Status,
    double ProgressPercent, DateTime? EndDate);

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
    IEnumerable<ProjectStatusItemDto> Projects,
    IEnumerable<IssueMatrixCellDto> IssueMatrix,
    IEnumerable<UpcomingMilestoneDto> UpcomingMilestones,
    IEnumerable<WbsProgressDto> WbsProgress);

// '프로젝트별 활동량' 위젯 — sinceDate 이후 활동 카운트, count DESC.
public record ActivityByProjectDto(
    int ProjectId, string ProjectName, int Count);

// D-1 리소스 히트맵: across-project 담당자 × 8주 마감 밀도.
// WeekStarts 길이 8 (월요일 시작 ISO), Rows[i].Counts 길이 8.
public record ResourceHeatmapDto(
    IReadOnlyList<string> WeekStarts,
    IReadOnlyList<ResourceHeatmapRow> Rows,
    int TotalItems,
    int UnassignedItems);

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

// 마감 캘린더(통합 모니터링 '작업' 탭의 캘린더 뷰): across-project WBS 종료일 + 이슈 마감일 이벤트.
// Date 는 yyyy-MM-dd. IsMilestone 은 wbs 전용(issue 는 false), Priority 는 issue 전용(wbs 는 null).
public record CalendarEventDto(
    string Kind, // "wbs" | "issue"
    int Id,
    int ProjectId,
    string ProjectName,
    string Title,
    string Date,
    string Status,
    bool IsMilestone,
    string? Priority);
