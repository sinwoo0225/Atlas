using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class DevInfoRepository(AppDbContext db) : IDevInfoRepository
{
    public async Task<IEnumerable<DevInfoItem>> GetByProjectAsync(int projectId) =>
        await db.DevInfoItems.Where(x => x.ProjectId == projectId).OrderByDescending(x => x.UpdatedAt).ToListAsync();

    public async Task<DevInfoItem?> GetByIdAsync(int id) => await db.DevInfoItems.FindAsync(id);

    public async Task<DevInfoItem> CreateAsync(DevInfoItem item)
    {
        db.DevInfoItems.Add(item);
        await db.SaveChangesAsync();
        return item;
    }

    public async Task<DevInfoItem> UpdateAsync(DevInfoItem item)
    {
        item.UpdatedAt = DateTime.UtcNow;
        db.DevInfoItems.Update(item);
        await db.SaveChangesAsync();
        return item;
    }

    public async Task DeleteAsync(int id)
    {
        var item = await db.DevInfoItems.FindAsync(id);
        if (item != null) { db.DevInfoItems.Remove(item); await db.SaveChangesAsync(); }
    }
}
