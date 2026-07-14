using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class WbsRepository(AppDbContext db) : IWbsRepository
{
    public async Task<IEnumerable<WbsItem>> GetByProjectAsync(int projectId, int? versionId = null)
    {
        var query = db.WbsItems.Where(x => x.ProjectId == projectId);
        if (versionId.HasValue)
            query = query.Where(x => x.VersionId == versionId);
        // 프로젝트 전체를 한 번에 로드 — Subtasks Include 로 모든 노드(자식 포함)의 진행률 카운트가 채워진다.
        return await query.Include(x => x.Children).Include(x => x.Subtasks).OrderBy(x => x.SortOrder).ToListAsync();
    }

    // 기준선 캡처 — 프로젝트(선택 시 버전)의 모든 작업 BaselineStart/End 를 현재 계획 일정으로 복사. 영향 행 수 반환.
    public async Task<int> CaptureBaselineAsync(int projectId, int? versionId)
    {
        var q = db.WbsItems.Where(x => x.ProjectId == projectId);
        if (versionId.HasValue) q = q.Where(x => x.VersionId == versionId);
        return await q.ExecuteUpdateAsync(s => s
            .SetProperty(x => x.BaselineStart, x => x.StartDate)
            .SetProperty(x => x.BaselineEnd, x => x.EndDate));
    }

    // 기준선 클리어 — BaselineStart/End 를 비움.
    public async Task<int> ClearBaselineAsync(int projectId, int? versionId)
    {
        var q = db.WbsItems.Where(x => x.ProjectId == projectId);
        if (versionId.HasValue) q = q.Where(x => x.VersionId == versionId);
        return await q.ExecuteUpdateAsync(s => s
            .SetProperty(x => x.BaselineStart, (DateTime?)null)
            .SetProperty(x => x.BaselineEnd, (DateTime?)null));
    }

    // 평면 필터 조회 — 트리 조립/Children Include 없음. SortOrder 순.
    public async Task<IEnumerable<WbsItem>> QueryAsync(int projectId, int? versionId, WbsListFilter filter)
    {
        var f = filter ?? WbsListFilter.None;
        var q = db.WbsItems.Where(x => x.ProjectId == projectId);
        if (versionId.HasValue)
            q = q.Where(x => x.VersionId == versionId);

        if (f.Statuses is { Count: > 0 })
        {
            var statuses = f.Statuses.ToArray();
            q = q.Where(x => statuses.Contains(x.Status));
        }
        if (f.ActiveOn is DateTime d)
        {
            // 해당 일자에 진행 중: Start <= d <= End. null 경계는 무한대(시작 미정=이미 시작, 종료 미정=아직 안 끝남).
            var dStart = d.Date;
            var dEnd = d.Date.AddDays(1); // half-open 상한
            q = q.Where(x => (x.StartDate == null || x.StartDate < dEnd)
                          && (x.EndDate == null || x.EndDate >= dStart));
        }
        if (f.StartFrom is DateTime sf)
            q = q.Where(x => x.StartDate != null && x.StartDate >= sf);
        if (f.StartTo is DateTime sto)
        {
            var end = sto.Date.AddDays(1);
            q = q.Where(x => x.StartDate != null && x.StartDate < end);
        }
        if (f.EndFrom is DateTime ef)
            q = q.Where(x => x.EndDate != null && x.EndDate >= ef);
        if (f.EndTo is DateTime eto)
        {
            var end = eto.Date.AddDays(1);
            q = q.Where(x => x.EndDate != null && x.EndDate < end);
        }
        if (!string.IsNullOrWhiteSpace(f.Assignee))
        {
            var a = f.Assignee;
            q = q.Where(x => x.Assignee.Contains(a));
        }
        if (f.Milestone is bool ms)
            q = q.Where(x => x.IsMilestone == ms);
        if (!string.IsNullOrWhiteSpace(f.Keyword))
        {
            var kw = f.Keyword;
            q = q.Where(x => x.Name.Contains(kw) || x.Notes.Contains(kw));
        }
        if (f.OverdueStart)
        {
            // 시작 지연 — 계획 시작일이 오늘(자정) 이전인데 아직 Planned(미착수).
            var today = DateTime.Today;
            q = q.Where(x => x.Status == WbsStatus.Planned && x.StartDate != null && x.StartDate <= today);
        }

        return await q.Include(x => x.Subtasks).OrderBy(x => x.SortOrder).ToListAsync();
    }

    public async Task<WbsItem?> GetByIdAsync(int id) =>
        await db.WbsItems.Include(x => x.Children).Include(x => x.Subtasks).FirstOrDefaultAsync(x => x.Id == id);

    public async Task<WbsItem> CreateAsync(WbsItem item)
    {
        db.WbsItems.Add(item);
        await db.SaveChangesAsync();
        return item;
    }

    public async Task<WbsItem> UpdateAsync(WbsItem item, DateTime? expectedUpdatedAt = null)
    {
        // 동시성 토큰: 클라가 GET 한 시점의 UpdatedAt 을 OriginalValue 로 강제 → DB 의 현재 값과 다르면 EF 가 0행 update → DbUpdateConcurrencyException.
        // expectedUpdatedAt 이 없으면 내부 호출 (Promote/Sync) — 기존 동작 그대로.
        if (expectedUpdatedAt is DateTime expected)
            db.Entry(item).Property(x => x.UpdatedAt).OriginalValue = expected;
        item.UpdatedAt = DateTime.UtcNow;
        db.WbsItems.Update(item);
        await db.SaveChangesAsync();
        return item;
    }

    public async Task DeleteAsync(int id)
    {
        var item = await db.WbsItems.FindAsync(id);
        if (item != null)
        {
            db.WbsItems.Remove(item);
            await db.SaveChangesAsync();
        }
    }

    public async Task<IEnumerable<WbsVersion>> GetVersionsByProjectAsync(int projectId) =>
        await db.WbsVersions.Where(v => v.ProjectId == projectId).OrderBy(v => v.CreatedAt).ToListAsync();

    public async Task<WbsVersion?> GetVersionByIdAsync(int id) =>
        await db.WbsVersions.FindAsync(id);

    public async Task<WbsVersion> CreateVersionAsync(WbsVersion version)
    {
        db.WbsVersions.Add(version);
        await db.SaveChangesAsync();
        return version;
    }

    public async Task SetCurrentVersionAsync(int projectId, int versionId)
    {
        var versions = await db.WbsVersions.Where(v => v.ProjectId == projectId).ToListAsync();
        foreach (var v in versions)
            v.IsCurrent = v.Id == versionId;
        await db.SaveChangesAsync();
    }

    // OnlyTasks() 가 핵심 — 이게 빠져 있어서 그룹(그루핑 노드)이 '내 업무'(/api/my-work)·시작 화면 위젯·
    // 마감임박/일일정리 알림에 실제 작업처럼 섞여 나왔다. 다른 모든 지표는 부모를 빼는데 여기만 안 뺐다.
    // 이 한 줄이 TodoService·StartPageService·알림 2소스를 동시에 고친다(프론트 변경 0).
    public async Task<IEnumerable<WbsItem>> GetOpenAcrossProjectsAsync() =>
        await db.WbsItems
            .OnlyTasks().OnlyOpen()
            .Include(x => x.Project)
            .ToListAsync();
}
