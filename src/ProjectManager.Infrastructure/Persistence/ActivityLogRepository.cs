using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class ActivityLogRepository(AppDbContext db) : IActivityLogRepository
{
    public async Task<IEnumerable<ActivityLog>> GetByProjectAsync(int projectId, int limit) =>
        await db.ActivityLogs
            .Where(x => x.ProjectId == projectId)
            .OrderByDescending(x => x.Timestamp)
            .Take(limit)
            .ToListAsync();

    public async Task<IEnumerable<ActivityLog>> GetAllAsync(int limit, int offset) =>
        await db.ActivityLogs
            .OrderByDescending(x => x.Timestamp)
            .Skip(offset)
            .Take(limit)
            .ToListAsync();

    public Task<int> PruneOlderThanAsync(DateTime cutoffUtc) =>
        db.ActivityLogs.Where(x => x.Timestamp < cutoffUtc).ExecuteDeleteAsync();
}
