using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class WbsDevInfoLinkRepository(AppDbContext db) : IWbsDevInfoLinkRepository
{
    public async Task<IEnumerable<WbsDevInfoLink>> GetByWbsItemAsync(int wbsItemId) =>
        await db.WbsDevInfoLinks
            .Where(x => x.WbsItemId == wbsItemId)
            .Include(x => x.DevInfoItem)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync();

    public async Task<IEnumerable<WbsDevInfoLink>> GetByDevInfoAsync(int devInfoItemId) =>
        await db.WbsDevInfoLinks
            .Where(x => x.DevInfoItemId == devInfoItemId)
            .Include(x => x.WbsItem)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync();

    public async Task<WbsDevInfoLink?> GetAsync(int wbsItemId, int devInfoItemId) =>
        await db.WbsDevInfoLinks.FirstOrDefaultAsync(x => x.WbsItemId == wbsItemId && x.DevInfoItemId == devInfoItemId);

    public async Task<WbsDevInfoLink?> GetByIdAsync(int id) => await db.WbsDevInfoLinks.FindAsync(id);

    public async Task<WbsDevInfoLink> CreateAsync(WbsDevInfoLink link)
    {
        db.WbsDevInfoLinks.Add(link);
        await db.SaveChangesAsync();
        return link;
    }

    public async Task<bool> DeleteAsync(int wbsItemId, int devInfoItemId)
    {
        var link = await GetAsync(wbsItemId, devInfoItemId);
        if (link is null) return false;
        db.WbsDevInfoLinks.Remove(link);
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<IReadOnlyList<(int WbsItemId, int DevInfoItemId)>> GetByProjectAsync(int projectId)
    {
        // WbsItem.ProjectId 기준 join — WbsDevInfoLinkService.CreateAsync 가 WBS/DevInfo ProjectId 동일 보장.
        var rows = await db.WbsDevInfoLinks
            .Where(l => l.WbsItem!.ProjectId == projectId)
            .Select(l => new { l.WbsItemId, l.DevInfoItemId })
            .ToListAsync();
        return rows.Select(r => (r.WbsItemId, r.DevInfoItemId)).ToList();
    }
}
