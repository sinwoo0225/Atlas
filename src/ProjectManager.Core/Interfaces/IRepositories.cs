using ProjectManager.Core.Domain;

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
}

public interface IChangeLogRepository
{
    Task<IEnumerable<ChangeLog>> GetByProjectAsync(int projectId);
    Task<ChangeLog?> GetByIdAsync(int id);
    Task<ChangeLog> CreateAsync(ChangeLog log);
    Task<ChangeLog> UpdateAsync(ChangeLog log);
    Task DeleteAsync(int id);
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
}

public interface IWorkLogRepository
{
    Task<IEnumerable<WorkLog>> GetByProjectWeekAsync(int projectId, DateTime weekStart);
    Task<WorkLog?> GetByProjectDateAsync(int projectId, DateTime date);
    Task<IEnumerable<WorkLog>> GetAllInRangeAsync(DateTime fromInclusive, DateTime toExclusive);
    Task<WorkLog> UpsertAsync(WorkLog log);
}
