using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

public record ProjectDto(
    int Id, string Name, string Category, string Description, string Goal,
    ProjectStatus Status,
    DateTime? StartDate, DateTime? EndDate, decimal? Budget,
    string Participants, string Deliverables, string RelatedLinks,
    string FolderPath, string GitRepoPath, DateTime CreatedAt, DateTime UpdatedAt);

public record CreateProjectDto(
    string Name, string Category, string Description, string Goal,
    ProjectStatus Status,
    DateTime? StartDate, DateTime? EndDate, decimal? Budget,
    string Participants, string Deliverables, string RelatedLinks,
    string? GitRepoPath = null);

public record UpdateProjectDto(
    string Name, string Category, string Description, string Goal,
    ProjectStatus Status,
    DateTime? StartDate, DateTime? EndDate, decimal? Budget,
    string Participants, string Deliverables, string RelatedLinks,
    string? GitRepoPath = null);

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

// 백업 zip 미리보기 — 어떤 프로젝트가 들어있는지 보여주고 사용자가 한 개를 선택.
// (백업은 DB 전체를 담으므로 zip 하나에 다수 프로젝트가 포함됨.)
public record ImportPreviewItemDto(
    int Id, string Name, string Description,
    DateTime CreatedAt, DateTime UpdatedAt,
    int IssueCount, int WbsCount, int MeetingCount);

// 가져오기 결과 요약 — 카운트 + 리소스 매핑 통계 + 경고 목록.
// IssuesAssigneeMatched: 백업측 담당자를 Email 로 현재 DB 리소스에 매핑 성공한 이슈 수.
// IssuesAssigneeMissing: 담당자가 있었으나 매핑 실패하여 미할당(null) 처리된 이슈 수.
public record ImportProjectResultDto(
    int NewProjectId, string NewProjectName, string NewFolderPath,
    int IssuesImported, int IssuesAssigneeMatched, int IssuesAssigneeMissing,
    int WbsItemsImported, int WbsVersionsImported,
    int MeetingsImported, int DevInfoItemsImported,
    int WorkLogsImported, int ChangeLogsImported, int IssueWbsLinksImported,
    IReadOnlyList<string> Warnings);
