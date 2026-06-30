using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

// 엔티티별 list 필터 — repository 의 IQueryable 에 DB-side WHERE 로 푸시다운된다(CLI·MCP 공용).
// 모든 필드 nullable/기본값 → 미지정 시 no-op. 필터를 추가해도 인터페이스 시그니처는 불변
// (메서드는 `XxxListFilter? filter = null` 한 파라미터만 받는다).

public sealed record IssueListFilter(
    IReadOnlyList<IssueStatus>? Statuses = null,
    IReadOnlyList<IssuePriority>? Priorities = null,
    int? AssigneeResourceId = null,
    string? AssigneeName = null,
    DateTime? DueFrom = null,
    DateTime? DueTo = null,
    DateTime? OccurredFrom = null,
    DateTime? OccurredTo = null,
    bool Overdue = false,
    string? Keyword = null,
    string? Category = null)
{
    public static readonly IssueListFilter None = new();

    // --open 편의 플래그가 해석되는 미해결 상태 집합 (IssueRepository.GetOpenAcrossProjectsAsync 와 동일).
    public static readonly IReadOnlyList<IssueStatus> OpenStatuses =
        new[] { IssueStatus.Open, IssueStatus.InProgress };

    public bool IsEmpty =>
        (Statuses is null || Statuses.Count == 0) &&
        (Priorities is null || Priorities.Count == 0) &&
        AssigneeResourceId is null &&
        string.IsNullOrWhiteSpace(AssigneeName) &&
        DueFrom is null && DueTo is null &&
        OccurredFrom is null && OccurredTo is null &&
        !Overdue &&
        string.IsNullOrWhiteSpace(Keyword) &&
        string.IsNullOrWhiteSpace(Category);
}

public sealed record WbsListFilter(
    IReadOnlyList<WbsStatus>? Statuses = null,
    DateTime? ActiveOn = null,
    DateTime? StartFrom = null,
    DateTime? StartTo = null,
    DateTime? EndFrom = null,
    DateTime? EndTo = null,
    string? Assignee = null,
    bool? Milestone = null,
    string? Keyword = null,
    // 시작 지연 — 계획 시작일이 오늘(자정) 이전인데 아직 Planned(미착수). 착수 환기·인사이트용.
    bool OverdueStart = false)
{
    public static readonly WbsListFilter None = new();

    // --open 편의 플래그가 해석되는 미완 상태 집합 (WbsRepository.GetOpenAcrossProjectsAsync 의 !Done 과 동치).
    public static readonly IReadOnlyList<WbsStatus> OpenStatuses =
        new[] { WbsStatus.Planned, WbsStatus.Waiting, WbsStatus.InProgress };

    public bool IsEmpty =>
        (Statuses is null || Statuses.Count == 0) &&
        ActiveOn is null &&
        StartFrom is null && StartTo is null &&
        EndFrom is null && EndTo is null &&
        string.IsNullOrWhiteSpace(Assignee) &&
        Milestone is null &&
        string.IsNullOrWhiteSpace(Keyword) &&
        !OverdueStart;
}

public sealed record ProjectListFilter(
    IReadOnlyList<ProjectStatus>? Statuses = null,
    DateTime? ActiveOn = null,
    DateTime? StartFrom = null,
    DateTime? StartTo = null,
    DateTime? EndFrom = null,
    DateTime? EndTo = null,
    string? Category = null,
    string? Keyword = null)
{
    public static readonly ProjectListFilter None = new();

    // --open: 진행/대기 중 (완료·유지보수 제외).
    public static readonly IReadOnlyList<ProjectStatus> OpenStatuses =
        new[] { ProjectStatus.Planned, ProjectStatus.Waiting, ProjectStatus.InProgress };
}

public sealed record MeetingListFilter(
    MeetingCategory? Category = null,
    DateTime? From = null,
    DateTime? To = null,
    string? Keyword = null)
{
    public static readonly MeetingListFilter None = new();
}

public sealed record ChangeLogListFilter(
    IReadOnlyList<ImpactLevel>? Impacts = null,
    DateTime? From = null,
    DateTime? To = null,
    int? SourceIssueId = null,
    int? SourceWbsItemId = null,
    string? Keyword = null)
{
    public static readonly ChangeLogListFilter None = new();
}

public sealed record DevInfoListFilter(
    IReadOnlyList<DevInfoType>? Types = null,
    // 태그 부분일치(AND — 지정한 태그를 모두 포함). 콤마 구분 Tags 필드에 대한 substring 매칭.
    IReadOnlyList<string>? Tags = null,
    DateTime? UpdatedFrom = null,
    DateTime? UpdatedTo = null,
    string? Keyword = null)
{
    public static readonly DevInfoListFilter None = new();
}

public sealed record ResourceListFilter(
    ResourceType? Type = null,
    string? Department = null,
    string? Keyword = null)
{
    public static readonly ResourceListFilter None = new();
}

public sealed record TodoListFilter(
    IReadOnlyList<TodoStatus>? Statuses = null,
    int? AssigneeResourceId = null,
    bool Open = false,
    string? Keyword = null)
{
    public static readonly TodoListFilter None = new();

    public bool IsEmpty =>
        (Statuses is null || Statuses.Count == 0) &&
        AssigneeResourceId is null &&
        !Open &&
        string.IsNullOrWhiteSpace(Keyword);
}
