using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class WbsRepository(AppDbContext db) : IWbsRepository
{
    public async Task<IEnumerable<WbsItem>> GetByProjectAsync(int projectId, int? versionId = null)
    {
        var query = db.WbsItems.Where(x => x.ProjectId == projectId);
        if (versionId.HasValue)
            query = query.Where(x => x.VersionId == versionId);
        return await query.Include(x => x.Children).OrderBy(x => x.Order).ToListAsync();
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
