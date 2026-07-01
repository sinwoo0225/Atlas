using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

public class WbsInvalidParentException(string message) : Exception(message);

public class WbsService(
    IWbsRepository repo,
    WorkLogService workLogService,
    IMeetingRepository meetingRepo,
    WbsAssignmentService assignmentService,
    IActorAccessor actorAccessor,
    IWorkLogScopeAccessor workLogScope)
{
    public async Task<IEnumerable<WbsItemDto>> GetByProjectAsync(int projectId, int? versionId = null)
    {
        var items = await repo.GetByProjectAsync(projectId, versionId);
        var roots = items.Where(x => x.ParentId == null);
        return roots.Select(x => ToDto(x, items));
    }

    // 필터 조회 — 평면 DTO 리스트(Children 없음). 트리로 묶지 않는 이유: 필터가 부모-자식 경계를 가르면
    // 매칭된 하위 항목이 root 누락으로 사라진다. 각 항목은 ParentId 를 들고 있어 클라가 재구성 가능.
    public async Task<IEnumerable<WbsItemDto>> QueryAsync(int projectId, int? versionId, WbsListFilter filter) =>
        (await repo.QueryAsync(projectId, versionId, filter)).Select(ToFlatDto);

    public async Task<WbsItemDto?> GetByIdAsync(int id)
    {
        var item = await repo.GetByIdAsync(id);
        return item is null ? null : ToDto(item, []);
    }

    public async Task<WbsItemDto> CreateAsync(CreateWbsItemDto dto)
    {
        // 사이클 14 — SortOrder 자동 부여: 같은 부모 + 같은 startDate 그룹 max+1, 그룹 없으면 전체 형제 max+1, 형제 없으면 0.
        var allInProject = await repo.GetByProjectAsync(dto.ProjectId, null);
        var siblings = allInProject.Where(x => x.ParentId == dto.ParentId).ToList();
        var sameDate = siblings.Where(x => x.StartDate == dto.StartDate).ToList();
        var nextSortOrder = sameDate.Count > 0
            ? sameDate.Max(x => x.SortOrder) + 1
            : (siblings.Count > 0 ? siblings.Max(x => x.SortOrder) + 1 : 0);

        var item = new WbsItem
        {
            ProjectId = dto.ProjectId, VersionId = dto.VersionId, ParentId = dto.ParentId,
            Name = dto.Name, Assignee = dto.Assignee,
            StartDate = dto.StartDate, EndDate = dto.EndDate,
            Status = dto.Status, IsMilestone = dto.IsMilestone,
            Importance = dto.Importance, Notes = dto.Notes,
            SortOrder = nextSortOrder,
            EstimateHours = dto.EstimateHours,
            // 진행/완료 상태로 생성되면 착수일도 함께(명시값 우선, 없으면 오늘). 대기(Waiting)·예정은 미착수.
            ActualStartDate = dto.ActualStartDate ?? (dto.Status is WbsStatus.InProgress or WbsStatus.Done ? DateTime.Today : null),
            // 완료 상태로 생성되면 완료일도 함께(명시값 우선, 없으면 오늘).
            CompletedDate = dto.CompletedDate ?? (dto.Status == WbsStatus.Done ? DateTime.Today : null),
        };
        var created = await repo.CreateAsync(item);
        await assignmentService.ReconcileFromFreeTextAsync(created);
        // 예정(Planned)이 아닌 상태(대기·진행·완료)로 생성되면 상태 전환과 동일하게 업무일지에 자동 등록.
        // 신규 항목은 항상 리프라 자식 검사 불필요. '작성 범위'(설정)가 '자신만'이면 actor 담당 작업만 기록.
        if (created.Status != WbsStatus.Planned && WorkLogScopeGate.ShouldAutoLog(workLogScope, actorAccessor, created.Assignee))
        {
            // 생성=최초 상태이므로 진행은 [시작](Update 경로 일관), 대기는 [대기], 완료는 [완료].
            var marker = created.Status switch
            {
                WbsStatus.InProgress => WorkLogMerge.DoneMarker.Started,
                WbsStatus.Done => WorkLogMerge.DoneMarker.Completed,
                _ => WorkLogMerge.DoneMarker.Waiting,
            };
            var ancestors = await BuildAncestorNamesAsync(created);
            await workLogService.UpsertDoneHierarchicalAsync(created.ProjectId, DateTime.Today,
                ancestors, "작업", created.Name, created.Assignee, marker);
        }
        return ToDto(created, []);
    }

    public async Task<WbsItemDto?> UpdateAsync(int id, UpdateWbsItemDto dto)
    {
        var item = await repo.GetByIdAsync(id);
        if (item is null) return null;

        // ParentId 가 바뀌는 경우에만 가드 — 같은 값 재저장은 통과 (서버 어쩌다 nop).
        var parentChanged = item.ParentId != dto.ParentId;
        if (parentChanged)
        {
            if (dto.ParentId == id)
                throw new WbsInvalidParentException("자기 자신을 부모로 지정할 수 없습니다.");

            // 프로젝트 전체를 한 번만 가져와 가드(순환 검사)와 Order 재계산 양쪽에서 재사용.
            var allItems = (await repo.GetByProjectAsync(item.ProjectId, null)).ToList();

            if (dto.ParentId is int newParent)
            {
                var byId = allItems.ToDictionary(x => x.Id);
                if (!byId.TryGetValue(newParent, out var parentNode))
                    throw new WbsInvalidParentException("선택한 부모 작업이 존재하지 않습니다.");

                // 새 부모를 따라 올라가며 자기 자신을 만나면 순환 — 자손을 부모로 지정한 경우.
                for (var cursor = parentNode; cursor is not null; )
                {
                    if (cursor.Id == id)
                        throw new WbsInvalidParentException("자신의 하위 작업을 부모로 지정할 수 없습니다.");
                    cursor = cursor.ParentId is int pid && byId.TryGetValue(pid, out var next) ? next : null;
                }
            }

            item.ParentId = dto.ParentId;

            // 새 부모(또는 root) children 의 max SortOrder + 1 을 부여 — 옮긴 항목이 새 sibling 들 맨 뒤에 오도록.
            // 클라이언트가 보낸 dto.SortOrder 는 옛 부모 기준이라 새 부모에서는 무의미. parentChanged 분기에서 덮어씀.
            var newSiblings = allItems.Where(x => x.ParentId == dto.ParentId && x.Id != id).ToList();
            item.SortOrder = newSiblings.Count > 0 ? newSiblings.Max(x => x.SortOrder) + 1 : 0;
        }

        var wasDone = item.Status == WbsStatus.Done;
        // 미착수 상태 = 예정(Planned) 또는 대기(Waiting). 착수(ActualStartDate) 판정의 '이전' 기준.
        var wasNotStarted = item.Status is WbsStatus.Planned or WbsStatus.Waiting;
        var wasInProgress = item.Status == WbsStatus.InProgress;
        var nameChanged = item.Name != dto.Name;
        item.Name = dto.Name; item.Assignee = dto.Assignee;
        item.StartDate = dto.StartDate; item.EndDate = dto.EndDate;
        item.Status = dto.Status; item.IsMilestone = dto.IsMilestone;
        item.Importance = dto.Importance;
        if (!parentChanged) item.SortOrder = dto.SortOrder;
        item.Notes = dto.Notes;
        item.EstimateHours = dto.EstimateHours;
        // 착수일(실적): 클라가 보낸 값을 우선 반영(수동 보정·명시적 클리어).
        // 미착수(예정/대기)→진행/완료 첫 전환 시 값이 없으면 오늘로 자동 스탬프. 예정/대기로 되돌리면 클리어.
        item.ActualStartDate = dto.ActualStartDate;
        if (wasNotStarted && dto.Status is WbsStatus.InProgress or WbsStatus.Done && item.ActualStartDate is null)
            item.ActualStartDate = DateTime.Today;
        else if (dto.Status is WbsStatus.Planned or WbsStatus.Waiting)
            item.ActualStartDate = null;
        // 완료일(실적): 클라가 보낸 값을 우선 반영(수동 보정·명시적 클리어 라운드트립).
        // Done 진입 시 값이 없으면 오늘로 자동 스탬프. Done 에서 벗어나면 클리어.
        item.CompletedDate = dto.CompletedDate;
        if (!wasDone && dto.Status == WbsStatus.Done && item.CompletedDate is null)
            item.CompletedDate = DateTime.Today;
        else if (wasDone && dto.Status != WbsStatus.Done)
            item.CompletedDate = null;
        var updated = await repo.UpdateAsync(item, dto.UpdatedAt);
        // 자유텍스트 Assignee → WbsAssignment 동기화(배정·배분율 정본).
        await assignmentService.ReconcileFromFreeTextAsync(updated);
        // 리프(자식 없음)만 업무일지 자동 등록 — 자식이 있는 상위 업무는 요약 노드라 컨텍스트로만 등장.
        // item 은 GetByIdAsync 로 .Include(Children) 로드되어 추가 쿼리 없이 리프 판별 가능.
        // 시작(InProgress)·완료(Done) 전환 시 부모 체인과 함께 계층형으로 당일 '한 일'에 upsert.
        // 자동 일지는 '작성 범위'(설정) 가 '자신만'이면 actor 담당 작업에만 기록.
        if (updated.Children.Count == 0 && WorkLogScopeGate.ShouldAutoLog(workLogScope, actorAccessor, updated.Assignee))
        {
            if (!wasInProgress && updated.Status == WbsStatus.InProgress)
            {
                var ancestors = await BuildAncestorNamesAsync(updated);
                await workLogService.UpsertDoneHierarchicalAsync(updated.ProjectId, DateTime.Today,
                    ancestors, "작업", updated.Name, updated.Assignee, WorkLogMerge.DoneMarker.Started);
            }
            else if (!wasDone && updated.Status == WbsStatus.Done)
            {
                var ancestors = await BuildAncestorNamesAsync(updated);
                await workLogService.UpsertDoneHierarchicalAsync(updated.ProjectId, DateTime.Today,
                    ancestors, "작업", updated.Name, updated.Assignee, WorkLogMerge.DoneMarker.Completed);
            }
        }
        // C-1 양방향 sync (B 방향) — Name 변경 시 회의록 ActionItem.content 도 갱신.
        if (nameChanged)
            await meetingRepo.SyncPromotedWbsContentAsync(updated.ProjectId, updated.Id, updated.Name);
        return ToDto(updated, []);
    }

    // 리프의 부모 체인 이름을 최상위→직속 부모 순으로. (업무일지 계층 등록용)
    // GetByIdAsync 는 Parent 를 로드하지 않으므로 프로젝트 전체를 한 번 읽어 ParentId 로 워크.
    private async Task<IReadOnlyList<string>> BuildAncestorNamesAsync(WbsItem leaf)
    {
        if (leaf.ParentId is null) return [];
        var all = (await repo.GetByProjectAsync(leaf.ProjectId, null)).ToDictionary(x => x.Id);
        return BuildAncestorNames(leaf, all);
    }

    // 사전(미리 로드한 프로젝트 전체) 기반 부모 체인 — 일괄 처리(진행 항목 자동 작성)에서 N+1 회피.
    private static IReadOnlyList<string> BuildAncestorNames(WbsItem leaf, IReadOnlyDictionary<int, WbsItem> all)
    {
        if (leaf.ParentId is null) return [];
        var chain = new List<string>();
        var cursor = leaf.ParentId;
        while (cursor is int pid && all.TryGetValue(pid, out var parent))
        {
            chain.Add(parent.Name);
            cursor = parent.ParentId;
        }
        chain.Reverse(); // 최상위 → 직속 부모
        return chain;
    }

    // '진행 항목 자동 작성'(F5) — 프로젝트의 '진행(InProgress)'·'대기(Waiting)' 리프 작업을 당일 '한 일'에
    // 각각 [진행]·[대기]로 일괄 upsert. 같은 작업의 기존 [시작]/[완료] 줄은 상태에 맞게 in-place 덮어쓰기(WorkLogMerge).
    // 리프만·계층 컨텍스트·범위 게이트는 자동 등록과 동일. 등록 건수 반환.
    public async Task<int> AutoLogInProgressAsync(int projectId, DateTime date)
    {
        var all = (await repo.GetByProjectAsync(projectId, null)).ToList();
        var byId = all.ToDictionary(x => x.Id);
        var parentIds = all.Where(x => x.ParentId is not null).Select(x => x.ParentId!.Value).ToHashSet();
        var count = 0;
        foreach (var item in all)
        {
            if (parentIds.Contains(item.Id)) continue;          // 리프만(자식 있는 부모 제외)
            var marker = item.Status switch
            {
                WbsStatus.InProgress => WorkLogMerge.DoneMarker.InProgress,
                WbsStatus.Waiting => WorkLogMerge.DoneMarker.Waiting,
                _ => (WorkLogMerge.DoneMarker?)null,
            };
            if (marker is null) continue;                       // 진행·대기만 대상
            if (!WorkLogScopeGate.ShouldAutoLog(workLogScope, actorAccessor, item.Assignee)) continue;
            await workLogService.UpsertDoneHierarchicalAsync(projectId, date,
                BuildAncestorNames(item, byId), "작업", item.Name, item.Assignee, marker.Value);
            count++;
        }
        return count;
    }

    // 칸반 드래그 — 상태만 변경. 현재 엔티티 값으로 UpdateDto 를 구성해 기존 UpdateAsync 재사용
    // (완료 전환 시 worklog 자동 등록·동시성 가드 그대로). 현재 UpdatedAt 을 토큰으로 써 staleness 없음.
    public async Task<bool> SetStatusAsync(int id, WbsStatus status)
    {
        var item = await repo.GetByIdAsync(id);
        if (item is null) return false;
        if (item.Status == status) return true;
        var dto = new UpdateWbsItemDto(
            item.ParentId, item.Name, item.Assignee, item.StartDate, item.EndDate,
            status, item.IsMilestone, item.Importance, item.Notes, item.SortOrder,
            item.CompletedDate, item.UpdatedAt, item.EstimateHours, item.ActualStartDate);
        await UpdateAsync(id, dto);
        return true;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var item = await repo.GetByIdAsync(id);
        if (item is null) return false;
        var projectId = item.ProjectId;
        await repo.DeleteAsync(id);
        // C-1 승격 취소 — 삭제된 WbsItem 을 가리키는 ActionItem.promotedWbsItemId 정리.
        await meetingRepo.ClearPromotedWbsRefsAsync(projectId, id);
        return true;
    }

    public async Task<IEnumerable<WbsVersionDto>> GetVersionsAsync(int projectId) =>
        (await repo.GetVersionsByProjectAsync(projectId)).Select(ToVersionDto);

    public async Task<WbsVersionDto> CreateVersionAsync(CreateWbsVersionDto dto)
    {
        var version = new WbsVersion
        {
            ProjectId = dto.ProjectId,
            VersionName = dto.VersionName,
            Description = dto.Description
        };
        return ToVersionDto(await repo.CreateVersionAsync(version));
    }

    public async Task SetCurrentVersionAsync(int projectId, int versionId) =>
        await repo.SetCurrentVersionAsync(projectId, versionId);

    // 기준선 캡처/클리어 — 현재 계획 일정을 BaselineStart/End 로 박제(또는 비움). 영향 행 수 반환.
    public Task<int> CaptureBaselineAsync(int projectId, int? versionId) => repo.CaptureBaselineAsync(projectId, versionId);
    public Task<int> ClearBaselineAsync(int projectId, int? versionId) => repo.ClearBaselineAsync(projectId, versionId);

    private static WbsItemDto ToDto(WbsItem item, IEnumerable<WbsItem> all)
    {
        var children = item.Children?.Select(c => ToDto(c, all)).ToList();
        // 부모는 자손 leaf 의 추정 합(저장 안 함, 표시용). 추정된 자손이 하나도 없으면 null.
        double? rolled;
        if (children is { Count: > 0 })
        {
            double sum = 0; var any = false;
            foreach (var c in children)
                if (c.RolledUpEstimateHours is double v) { sum += v; any = true; }
            rolled = any ? sum : null;
        }
        else rolled = item.EstimateHours;
        var subs = item.Subtasks?.OrderBy(s => s.SortOrder).ThenBy(s => s.Id).ToList();
        return new(
            item.Id, item.ProjectId, item.VersionId, item.ParentId,
            item.Name, item.Assignee, item.StartDate, item.EndDate,
            item.Status, item.IsMilestone, item.Importance, item.Notes,
            item.CreatedAt, item.UpdatedAt,
            item.SortOrder,
            item.ActualStartDate,
            item.CompletedDate,
            item.EstimateHours, rolled,
            item.BaselineStart, item.BaselineEnd,
            subs?.Count ?? 0,
            subs?.Count(s => s.IsDone) ?? 0,
            subs?.Select(ToSubtaskDto).ToList(),
            children);
    }

    private static WbsSubtaskDto ToSubtaskDto(WbsSubtask s) =>
        new(s.Id, s.WbsItemId, s.Title, s.IsDone, s.SortOrder);

    // 평면 결과용 — Children 을 null 로 둬 출력에서 생략(WhenWritingNull). 계층은 ParentId 로 표현.
    // 평면 컨텍스트라 rollup 불가 → RolledUp 은 자기 추정으로.
    private static WbsItemDto ToFlatDto(WbsItem item) => new(
        item.Id, item.ProjectId, item.VersionId, item.ParentId,
        item.Name, item.Assignee, item.StartDate, item.EndDate,
        item.Status, item.IsMilestone, item.Importance, item.Notes,
        item.CreatedAt, item.UpdatedAt,
        item.SortOrder,
        item.ActualStartDate,
        item.CompletedDate,
        item.EstimateHours, item.EstimateHours,
        item.BaselineStart, item.BaselineEnd,
        item.Subtasks?.Count ?? 0,
        item.Subtasks?.Count(s => s.IsDone) ?? 0,
        null,
        null);

    private static WbsVersionDto ToVersionDto(WbsVersion v) => new(
        v.Id, v.ProjectId, v.VersionName, v.Description, v.CreatedAt, v.IsCurrent);
}
