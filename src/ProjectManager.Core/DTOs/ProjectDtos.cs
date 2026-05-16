using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

public record ProjectDto(
    int Id, string Name, string Description, string Goal,
    ProjectStatus Status,
    DateTime? StartDate, DateTime? EndDate, decimal? Budget,
    string Participants, string Deliverables, string RelatedLinks,
    string FolderPath, DateTime CreatedAt, DateTime UpdatedAt);

public record CreateProjectDto(
    string Name, string Description, string Goal,
    ProjectStatus Status,
    DateTime? StartDate, DateTime? EndDate, decimal? Budget,
    string Participants, string Deliverables, string RelatedLinks);

public record UpdateProjectDto(
    string Name, string Description, string Goal,
    ProjectStatus Status,
    DateTime? StartDate, DateTime? EndDate, decimal? Budget,
    string Participants, string Deliverables, string RelatedLinks);

public record ProjectDashboardDto(
    ProjectDto Project,
    IEnumerable<WbsItemDto> UpcomingMilestones,
    IEnumerable<ChangeLogDto> RecentChanges,
    IEnumerable<MeetingDto> RecentMeetings,
    IEnumerable<DevInfoItemDto> RecentDevInfo,
    IEnumerable<IssueDto> RecentIssues,
    WeeklyWorkLogProjectDto? ThisWeekWorkLog,
    RiskSignalsDto RiskSignals);

// 부하 인사이트(D-4) — 마감 지난/임박 WBS + 미해결 High 이슈를 한 자리에 모아 Dashboard 상단에서 즉시 노출.
// 각 list 는 cap 10. dueSoon 임계값은 우선 7일 고정 (사용자 설정은 별도 항목).
public record RiskSignalsDto(
    IReadOnlyList<WbsItemDto> OverdueWbs,
    IReadOnlyList<WbsItemDto> DueSoonWbs,
    IReadOnlyList<IssueDto> HighPriorityOpenIssues);
