using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Core.Interfaces;

public interface IProjectRepository
{
    Task<IEnumerable<Project>> GetAllAsync();
    Task<Project?> GetByIdAsync(int id);
    Task<Project> CreateAsync(Project project);
    Task<Project> UpdateAsync(Project project);
    Task DeleteAsync(int id);
}

public interface IWbsRepository
{
    Task<IEnumerable<WbsItem>> GetByProjectAsync(int projectId, int? versionId = null);
    Task<WbsItem?> GetByIdAsync(int id);
    Task<WbsItem> CreateAsync(WbsItem item);
    // expectedUpdatedAt 이 있으면 EF concurrency token 으로 비교 — 불일치 시 DbUpdateConcurrencyException → 409.
    // null 이면 기존 동작 (사이클 12 외 호출자 — Promote/Sync 같은 내부 로직).
    Task<WbsItem> UpdateAsync(WbsItem item, DateTime? expectedUpdatedAt = null);
    Task DeleteAsync(int id);
    Task<IEnumerable<WbsVersion>> GetVersionsByProjectAsync(int projectId);
    Task<WbsVersion?> GetVersionByIdAsync(int id);
    Task<WbsVersion> CreateVersionAsync(WbsVersion version);
    Task SetCurrentVersionAsync(int projectId, int versionId);
    // 시작 화면 위젯(E-2) — 모든 프로젝트의 미완(!Done) WBS, Project navigation 포함.
    Task<IEnumerable<WbsItem>> GetOpenAcrossProjectsAsync();
}

public interface IWbsTemplateRepository
{
    Task<IEnumerable<WbsTemplate>> GetAllAsync();
    Task<WbsTemplate?> GetByIdAsync(int id);
    Task<WbsTemplate> CreateAsync(WbsTemplate template);
    // expectedUpdatedAt 이 있으면 concurrency token 비교 — 불일치 시 DbUpdateConcurrencyException → 409.
    Task<WbsTemplate> UpdateAsync(WbsTemplate template, DateTime? expectedUpdatedAt = null);
    Task DeleteAsync(int id);
}

public interface IChangeLogRepository
{
    Task<IEnumerable<ChangeLog>> GetByProjectAsync(int projectId);
    Task<ChangeLog?> GetByIdAsync(int id);
    Task<ChangeLog> CreateAsync(ChangeLog log);
    Task<ChangeLog> UpdateAsync(ChangeLog log, DateTime? expectedUpdatedAt = null);
    Task DeleteAsync(int id);
    // 역방향 카운트 — Issue/WBS 행 배지용. (SourceIssueId 별 count, SourceWbsItemId 별 count).
    Task<(IReadOnlyDictionary<int, int> ByIssueId, IReadOnlyDictionary<int, int> ByWbsItemId)>
        GetSourceCountsAsync(int projectId);
}

public interface IMeetingRepository
{
    Task<IEnumerable<Meeting>> GetByProjectAsync(int projectId, string? keyword = null);
    Task<Meeting?> GetByIdAsync(int id);
    Task<Meeting> CreateAsync(Meeting meeting);
    Task<Meeting> UpdateAsync(Meeting meeting, DateTime? expectedUpdatedAt = null);
    Task DeleteAsync(int id);
    // C-1 승격 라이프사이클 — Issue/WBS 삭제 시 ActionItem JSON 의 promotedXxxId 키 제거.
    // 반환: 정리된 회의록 수. 각 회의록은 인터셉터에 의해 Update 로 자동 로깅됨.
    Task<int> ClearPromotedIssueRefsAsync(int projectId, int issueId);
    Task<int> ClearPromotedWbsRefsAsync(int projectId, int wbsItemId);
    // C-1 양방향 sync — Issue/WBS 의 Title/Name 변경 시 회의록 ActionItem.content 갱신 (값 같으면 skip — 루프 가드).
    Task<int> SyncPromotedIssueContentAsync(int projectId, int issueId, string newContent);
    Task<int> SyncPromotedWbsContentAsync(int projectId, int wbsItemId, string newContent);
}

public interface IDevInfoRepository
{
    Task<IEnumerable<DevInfoItem>> GetByProjectAsync(int projectId);
    Task<DevInfoItem?> GetByIdAsync(int id);
    Task<DevInfoItem> CreateAsync(DevInfoItem item);
    Task<DevInfoItem> UpdateAsync(DevInfoItem item);
    Task DeleteAsync(int id);
    Task<IReadOnlyList<string>> GetTagsByProjectAsync(int projectId);
    // C-4 follow-up — 태그 일괄 갱신. 영향 받은 item 수 반환. OrdinalIgnoreCase 매칭.
    Task<int> RenameTagAsync(int projectId, string oldTag, string newTag);
    Task<int> MergeTagsAsync(int projectId, IReadOnlyList<string> sourceTags, string targetTag);
}

public interface IResourceRepository
{
    Task<IEnumerable<Resource>> GetAllAsync();
    Task<Resource?> GetByIdAsync(int id);
    Task<Resource> CreateAsync(Resource resource);
    Task<Resource> UpdateAsync(Resource resource);
    Task DeleteAsync(int id);
}

public interface IIssueRepository
{
    Task<IEnumerable<Issue>> GetByProjectAsync(int projectId);
    Task<Issue?> GetByIdAsync(int id);
    Task<Issue> CreateAsync(Issue issue);
    Task<Issue> UpdateAsync(Issue issue);
    Task DeleteAsync(int id);
    // 시작 화면 위젯(E-2) — 모든 프로젝트의 미해결(Open|InProgress) Issue, Project + AssigneeResource 포함.
    Task<IEnumerable<Issue>> GetOpenAcrossProjectsAsync();
}

public interface IWorkLogRepository
{
    Task<IEnumerable<WorkLog>> GetByProjectWeekAsync(int projectId, DateTime weekStart);
    Task<WorkLog?> GetByProjectDateAsync(int projectId, DateTime date);
    Task<IEnumerable<WorkLog>> GetAllInRangeAsync(DateTime fromInclusive, DateTime toExclusive);
    Task<WorkLog> UpsertAsync(WorkLog log);
}

// 활동 로그 + Project LEFT JOIN 결과: ProjectId 가 null 인 경우 (예: Resource) ProjectName 도 null.
public record ActivityLogWithProject(ActivityLog Log, string? ProjectName);

public interface IActivityLogRepository
{
    Task<IEnumerable<ActivityLogWithProject>> GetByProjectAsync(int projectId, int limit);
    Task<IEnumerable<ActivityLogWithProject>> GetAllAsync(ActivityFilter filter);
    Task<IReadOnlyList<(int ProjectId, string ProjectName, int Count)>>
        GetCountsByProjectAsync(DateTime sinceUtc, int top);
    Task<int> PruneOlderThanAsync(DateTime cutoffUtc);
    // 가장 최근의 (entityType, entityId, expected) 활동 1 행의 Action 만 next 로 재기록.
    // PromotionService 가 자동 Create 직후 호출해 Promote 로 승격 표시. 없으면 false.
    Task<bool> RewriteLatestActionAsync(string entityType, int entityId, ActivityAction expected, ActivityAction next);
    // 활동 페이지 액터 필터 dropdown 옵션 — 빈도(많이 등장한 순) 정렬.
    Task<IReadOnlyList<string>> GetDistinctActorsAsync();
}

public interface IIssueWbsLinkRepository
{
    Task<IEnumerable<IssueWbsLink>> GetByIssueAsync(int issueId);
    Task<IEnumerable<IssueWbsLink>> GetByWbsItemAsync(int wbsItemId);
    Task<IssueWbsLink?> GetAsync(int issueId, int wbsItemId);
    Task<IssueWbsLink?> GetByIdAsync(int id);
    Task<IssueWbsLink> CreateAsync(IssueWbsLink link);
    Task<IssueWbsLink> UpdateAsync(IssueWbsLink link);
    Task<bool> DeleteAsync(int issueId, int wbsItemId);
    // 프로젝트의 모든 link tuple 반환 (카운트 배지용). Issue.ProjectId 기준 — Issue/WBS 양쪽 ProjectId 는 동일하다는 서비스 가드 전제.
    Task<IReadOnlyList<(int IssueId, int WbsItemId)>> GetByProjectAsync(int projectId);
}
