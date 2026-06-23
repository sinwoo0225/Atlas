using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Core.Interfaces;

public interface IProjectRepository
{
    // filter 미지정이면 전체. 지정 시 상태·기간·구분 등을 DB-side WHERE 로 좁힌다.
    Task<IEnumerable<Project>> GetAllAsync(ProjectListFilter? filter = null);
    Task<Project?> GetByIdAsync(int id);
    Task<Project> CreateAsync(Project project);
    Task<Project> UpdateAsync(Project project);
    Task DeleteAsync(int id);
}

public interface IWbsRepository
{
    Task<IEnumerable<WbsItem>> GetByProjectAsync(int projectId, int? versionId = null);
    // 필터(상태·기간·담당자 등) DB-side WHERE 로 좁힌 평면(flat) 결과 — 트리 조립 안 함.
    // 필터가 부모-자식 경계를 가르므로 트리로 묶으면 매칭된 하위 항목이 소실되기 때문(평면이 정답).
    Task<IEnumerable<WbsItem>> QueryAsync(int projectId, int? versionId, WbsListFilter filter);
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
    // 기준선 캡처/클리어 — 프로젝트(선택 시 버전)의 작업 BaselineStart/End 일괄 갱신. 영향 행 수 반환.
    Task<int> CaptureBaselineAsync(int projectId, int? versionId);
    Task<int> ClearBaselineAsync(int projectId, int? versionId);
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
    Task<IEnumerable<ChangeLog>> GetByProjectAsync(int projectId, ChangeLogListFilter? filter = null);
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
    // 과거 keyword 단일 인자 → 필터 레코드로 확장(Category·기간·키워드). keyword 는 filter.Keyword 로 흡수.
    Task<IEnumerable<Meeting>> GetByProjectAsync(int projectId, MeetingListFilter? filter = null);
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
    Task<IEnumerable<DevInfoItem>> GetByProjectAsync(int projectId, DevInfoListFilter? filter = null);
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
    // 전역(프로젝트 무관). filter 로 type·부서·키워드 좁히기.
    Task<IEnumerable<Resource>> GetAllAsync(ResourceListFilter? filter = null);
    Task<Resource?> GetByIdAsync(int id);
    Task<Resource> CreateAsync(Resource resource);
    Task<Resource> UpdateAsync(Resource resource);
    Task DeleteAsync(int id);
}

public interface IIssueRepository
{
    // filter 미지정(null) 이면 프로젝트 전체. 지정 시 상태·우선순위·담당자·기간 등을 DB-side WHERE 로 좁힌다.
    Task<IEnumerable<Issue>> GetByProjectAsync(int projectId, IssueListFilter? filter = null);
    Task<Issue?> GetByIdAsync(int id);
    Task<Issue> CreateAsync(Issue issue);
    Task<Issue> UpdateAsync(Issue issue);
    Task DeleteAsync(int id);
    // 시작 화면 위젯(E-2) — 모든 프로젝트의 미해결(Open|InProgress) Issue, Project + AssigneeResource 포함.
    Task<IEnumerable<Issue>> GetOpenAcrossProjectsAsync();
}

// 독립 TODO(프로젝트 무관). expectedUpdatedAt 동시성 토큰은 WbsRepository 와 동일 패턴.
public interface ITodoRepository
{
    Task<IEnumerable<TodoItem>> GetAllAsync(TodoListFilter? filter = null);
    Task<TodoItem?> GetByIdAsync(int id);
    Task<TodoItem> CreateAsync(TodoItem item);
    Task<TodoItem> UpdateAsync(TodoItem item, DateTime? expectedUpdatedAt = null);
    Task DeleteAsync(int id);
    // '내 업무' 집계용 — 미완(Open) 독립 TODO. assigneeResourceId 지정 시 그 담당자만(null=전부). AssigneeResource 포함.
    Task<IEnumerable<TodoItem>> GetOpenAsync(int? assigneeResourceId = null);
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

// WbsItem ↔ Resource 배정 + 배분율. ReconcileFromFreeText 가 자유텍스트 Assignee 와 동기화.
public interface IWbsAssignmentRepository
{
    Task<IEnumerable<WbsAssignment>> GetByWbsItemAsync(int wbsItemId);
    Task<IEnumerable<WbsAssignment>> GetByResourceAsync(int resourceId);
    Task<WbsAssignment?> GetAsync(int wbsItemId, int resourceId);
    Task<WbsAssignment> CreateAsync(WbsAssignment assignment);
    Task<WbsAssignment> UpdateAsync(WbsAssignment assignment);
    Task<bool> DeleteAsync(int wbsItemId, int resourceId);
    // 프로젝트의 모든 배정(작업 + 자원 navigation 포함). 용량 계산·plan context 용. WbsItem.ProjectId 기준.
    Task<IEnumerable<WbsAssignment>> GetByProjectAsync(int projectId, int? versionId = null);
}

// 자원 비가용 구간(휴가·공휴일). CapacityService 가 주별 용량 차감에 사용.
public interface IResourceAvailabilityRepository
{
    Task<IEnumerable<ResourceAvailability>> GetByResourceAsync(int resourceId);
    Task<ResourceAvailability?> GetByIdAsync(int id);
    Task<ResourceAvailability> CreateAsync(ResourceAvailability availability);
    Task DeleteAsync(int id);
    // 기간 겹치는 모든 자원의 비가용 구간 — 용량 집계 윈도우용.
    Task<IEnumerable<ResourceAvailability>> GetOverlappingAsync(DateTime fromInclusive, DateTime toInclusive);
}

// WbsItem(선행) → WbsItem(후행) 의존성. SchedulingService 의 CPM·리스케줄용.
public interface IWbsDependencyRepository
{
    Task<IEnumerable<WbsDependency>> GetByProjectAsync(int projectId, int? versionId = null);
    Task<IEnumerable<WbsDependency>> GetByWbsItemAsync(int wbsItemId);
    Task<WbsDependency?> GetAsync(int predecessorId, int successorId);
    Task<WbsDependency?> GetByIdAsync(int id);
    Task<WbsDependency> CreateAsync(WbsDependency dependency);
    Task<WbsDependency> UpdateAsync(WbsDependency dependency);
    Task<bool> DeleteAsync(int predecessorId, int successorId);
}

// WbsItem ↔ DevInfoItem "관련 정보" 다대다 (무타입). UpdateAsync 없음 — audit 외 변경 가능한 필드 없음.
public interface IWbsDevInfoLinkRepository
{
    Task<IEnumerable<WbsDevInfoLink>> GetByWbsItemAsync(int wbsItemId);
    Task<IEnumerable<WbsDevInfoLink>> GetByDevInfoAsync(int devInfoItemId);
    Task<WbsDevInfoLink?> GetAsync(int wbsItemId, int devInfoItemId);
    Task<WbsDevInfoLink?> GetByIdAsync(int id);
    Task<WbsDevInfoLink> CreateAsync(WbsDevInfoLink link);
    Task<bool> DeleteAsync(int wbsItemId, int devInfoItemId);
    // 프로젝트의 모든 link tuple 반환. WbsItem.ProjectId 기준 — WBS/DevInfo ProjectId 동일 서비스 가드 전제.
    Task<IReadOnlyList<(int WbsItemId, int DevInfoItemId)>> GetByProjectAsync(int projectId);
}
