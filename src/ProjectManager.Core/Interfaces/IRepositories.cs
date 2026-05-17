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
    Task<WbsItem> UpdateAsync(WbsItem item);
    Task DeleteAsync(int id);
    Task<IEnumerable<WbsVersion>> GetVersionsByProjectAsync(int projectId);
    Task<WbsVersion?> GetVersionByIdAsync(int id);
    Task<WbsVersion> CreateVersionAsync(WbsVersion version);
    Task SetCurrentVersionAsync(int projectId, int versionId);
    // 시작 화면 위젯(E-2) — 모든 프로젝트의 미완(!Done) WBS, Project navigation 포함.
    Task<IEnumerable<WbsItem>> GetOpenAcrossProjectsAsync();
}

public interface IChangeLogRepository
{
    Task<IEnumerable<ChangeLog>> GetByProjectAsync(int projectId);
    Task<ChangeLog?> GetByIdAsync(int id);
    Task<ChangeLog> CreateAsync(ChangeLog log);
    Task<ChangeLog> UpdateAsync(ChangeLog log);
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
    Task<Meeting> UpdateAsync(Meeting meeting);
    Task DeleteAsync(int id);
}

public interface IDevInfoRepository
{
    Task<IEnumerable<DevInfoItem>> GetByProjectAsync(int projectId);
    Task<DevInfoItem?> GetByIdAsync(int id);
    Task<DevInfoItem> CreateAsync(DevInfoItem item);
    Task<DevInfoItem> UpdateAsync(DevInfoItem item);
    Task DeleteAsync(int id);
    Task<IReadOnlyList<string>> GetTagsByProjectAsync(int projectId);
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
}

public interface IIssueWbsLinkRepository
{
    Task<IEnumerable<IssueWbsLink>> GetByIssueAsync(int issueId);
    Task<IEnumerable<IssueWbsLink>> GetByWbsItemAsync(int wbsItemId);
    Task<IssueWbsLink?> GetAsync(int issueId, int wbsItemId);
    Task<IssueWbsLink> CreateAsync(IssueWbsLink link);
    Task<bool> DeleteAsync(int issueId, int wbsItemId);
    // 프로젝트의 모든 link tuple 반환 (카운트 배지용). Issue.ProjectId 기준 — Issue/WBS 양쪽 ProjectId 는 동일하다는 서비스 가드 전제.
    Task<IReadOnlyList<(int IssueId, int WbsItemId)>> GetByProjectAsync(int projectId);
}
