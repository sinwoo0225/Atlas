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
        return await query.Include(x => x.Children).OrderBy(x => x.SortOrder).ToListAsync();
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

        return await q.OrderBy(x => x.SortOrder).ToListAsync();
    }

    public async Task<WbsItem?> GetByIdAsync(int id) =>
        await db.WbsItems.Include(x => x.Children).FirstOrDefaultAsync(x => x.Id == id);

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

    public async Task<IEnumerable<WbsItem>> GetOpenAcrossProjectsAsync() =>
        await db.WbsItems
            .Where(x => x.Status != WbsStatus.Done)
            .Include(x => x.Project)
            .ToListAsync();
}
