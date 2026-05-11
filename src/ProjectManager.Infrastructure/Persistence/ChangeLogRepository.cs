using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class ChangeLogRepository(AppDbContext db) : IChangeLogRepository
{
    public async Task<IEnumerable<ChangeLog>> GetByProjectAsync(int projectId) =>
        await db.ChangeLogs.Where(x => x.ProjectId == projectId).OrderByDescending(x => x.Date).ToListAsync();

    public async Task<ChangeLog?> GetByIdAsync(int id) => await db.ChangeLogs.FindAsync(id);

    public async Task<ChangeLog> CreateAsync(ChangeLog log)
    {
        db.ChangeLogs.Add(log);
        await db.SaveChangesAsync();
        return log;
    }

    public async Task<ChangeLog> UpdateAsync(ChangeLog log)
    {
        log.UpdatedAt = DateTime.UtcNow;
        db.ChangeLogs.Update(log);
        await db.SaveChangesAsync();
        return log;
    }

    public async Task DeleteAsync(int id)
    {
        var item = await db.ChangeLogs.FindAsync(id);
        if (item != null) { db.ChangeLogs.Remove(item); await db.SaveChangesAsync(); }
    }
}
