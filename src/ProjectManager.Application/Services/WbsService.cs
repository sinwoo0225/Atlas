using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

public class WbsInvalidParentException(string message) : Exception(message);

public class WbsService(IWbsRepository repo, WorkLogService workLogService, IMeetingRepository meetingRepo)
{
    public async Task<IEnumerable<WbsItemDto>> GetByProjectAsync(int projectId, int? versionId = null)
    {
        var items = await repo.GetByProjectAsync(projectId, versionId);
        var roots = items.Where(x => x.ParentId == null);
        return roots.Select(x => ToDto(x, items));
    }

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
        };
        return ToDto(await repo.CreateAsync(item), []);
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
        var nameChanged = item.Name != dto.Name;
        item.Name = dto.Name; item.Assignee = dto.Assignee;
        item.StartDate = dto.StartDate; item.EndDate = dto.EndDate;
        item.Status = dto.Status; item.IsMilestone = dto.IsMilestone;
        item.Importance = dto.Importance;
        if (!parentChanged) item.SortOrder = dto.SortOrder;
        item.Notes = dto.Notes;
        var updated = await repo.UpdateAsync(item, dto.UpdatedAt);
        if (!wasDone && updated.Status == WbsStatus.Done)
            await workLogService.AppendDoneAsync(updated.ProjectId, DateTime.Today, $"- {updated.Name}");
        // C-1 양방향 sync (B 방향) — Name 변경 시 회의록 ActionItem.content 도 갱신.
        if (nameChanged)
            await meetingRepo.SyncPromotedWbsContentAsync(updated.ProjectId, updated.Id, updated.Name);
        return ToDto(updated, []);
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

    private static WbsItemDto ToDto(WbsItem item, IEnumerable<WbsItem> all) => new(
        item.Id, item.ProjectId, item.VersionId, item.ParentId,
        item.Name, item.Assignee, item.StartDate, item.EndDate,
        item.Status, item.IsMilestone, item.Importance, item.Notes,
        item.CreatedAt, item.UpdatedAt,
        item.SortOrder,
        item.Children?.Select(c => ToDto(c, all)));

    private static WbsVersionDto ToVersionDto(WbsVersion v) => new(
        v.Id, v.ProjectId, v.VersionName, v.Description, v.CreatedAt, v.IsCurrent);
}
