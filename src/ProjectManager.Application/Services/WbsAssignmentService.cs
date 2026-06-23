using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

// 자유텍스트 WbsItem.Assignee("Alice, Bob") ↔ 구조화 WbsAssignment(배정 + 배분율) 동기화.
// 자유텍스트는 표시·레거시 집계의 정본, WbsAssignment 는 용량 계산의 정본. WBS 쓰기마다 Reconcile 로 수렴.
public class WbsAssignmentService(IWbsAssignmentRepository repo, ResourceService resourceService)
{
    // 멱등 — Assignee 토큰을 Resource 로 해석(없으면 생성)해 희망 집합을 만들고, 기존 배정과 diff:
    // 빠진 자원은 제거, 새 자원은 균등 배분(100/N)으로 추가. 기존 자원의 커스텀 배분은 보존.
    public async Task ReconcileFromFreeTextAsync(WbsItem item)
    {
        var names = (item.Assignee ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        // 희망 ResourceId 집합 (Person 해석/생성, 멱등).
        var desired = new List<int>();
        foreach (var n in names)
        {
            var r = await resourceService.GetOrCreateByNameAsync(n);
            if (!desired.Contains(r.Id)) desired.Add(r.Id);
        }

        var existing = (await repo.GetByWbsItemAsync(item.Id)).ToList();

        // 제거 — 희망에 없는 기존 배정.
        foreach (var ex in existing.Where(e => !desired.Contains(e.ResourceId)))
            await repo.DeleteAsync(ex.WbsItemId, ex.ResourceId);

        // 추가 — 기존에 없는 희망 자원. 신규 행은 인원수 균등 배분(최소 1).
        var toAdd = desired.Where(d => existing.All(e => e.ResourceId != d)).ToList();
        if (toAdd.Count > 0)
        {
            var even = desired.Count > 0 ? Math.Max(1, 100 / desired.Count) : 100;
            foreach (var rid in toAdd)
                await repo.CreateAsync(new WbsAssignment
                {
                    WbsItemId = item.Id, ResourceId = rid, AllocationPercent = even,
                });
        }
    }

    public async Task<IEnumerable<WbsAssignmentDto>> ListByWbsAsync(int wbsItemId) =>
        (await repo.GetByWbsItemAsync(wbsItemId)).Select(ToDto);

    public async Task<IEnumerable<WbsAssignmentDto>> ListByProjectAsync(int projectId, int? versionId = null) =>
        (await repo.GetByProjectAsync(projectId, versionId)).Select(ToDto);

    // 명시적 배정/배분 편집 — 없으면 생성, 있으면 배분율만 갱신. 자유텍스트 동기화 대상이 아닌 정밀 편집용.
    public async Task<WbsAssignmentDto> UpsertAsync(int wbsItemId, int resourceId, int allocationPercent)
    {
        var pct = Math.Clamp(allocationPercent, 0, 1000);
        var existing = await repo.GetAsync(wbsItemId, resourceId);
        if (existing is not null)
        {
            existing.AllocationPercent = pct;
            return ToDto(await repo.UpdateAsync(existing));
        }
        var created = await repo.CreateAsync(new WbsAssignment
        {
            WbsItemId = wbsItemId, ResourceId = resourceId, AllocationPercent = pct,
        });
        // ResourceName 채워 응답.
        return (await repo.GetByWbsItemAsync(wbsItemId)).Select(ToDto).First(a => a.Id == created.Id);
    }

    public Task<bool> RemoveAsync(int wbsItemId, int resourceId) => repo.DeleteAsync(wbsItemId, resourceId);

    private static WbsAssignmentDto ToDto(WbsAssignment a) => new(
        a.Id, a.WbsItemId, a.ResourceId, a.Resource?.Name ?? string.Empty, a.AllocationPercent);
}
