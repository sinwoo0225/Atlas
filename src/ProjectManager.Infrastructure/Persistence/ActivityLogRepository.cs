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
}
