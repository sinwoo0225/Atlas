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
    WeeklyWorkLogProjectDto? ThisWeekWorkLog);
