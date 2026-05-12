using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class WorkLogRepository(AppDbContext db) : IWorkLogRepository
{
    public async Task<IEnumerable<WorkLog>> GetByProjectWeekAsync(int projectId, DateTime weekStart)
    {
        var start = weekStart.Date;
        var end = start.AddDays(5);
        return await db.WorkLogs
            .Where(w => w.ProjectId == projectId && w.Date >= start && w.Date < end)
            .OrderBy(w => w.Date)
            .ToListAsync();
    }

    public async Task<WorkLog?> GetByProjectDateAsync(int projectId, DateTime date)
    {
        var d = date.Date;
        return await db.WorkLogs.FirstOrDefaultAsync(w => w.ProjectId == projectId && w.Date == d);
    }

    public async Task<IEnumerable<WorkLog>> GetAllInRangeAsync(DateTime fromInclusive, DateTime toExclusive)
    {
        var f = fromInclusive.Date;
        var t = toExclusive.Date;
        return await db.WorkLogs
            .Where(w => w.Date >= f && w.Date < t)
            .OrderBy(w => w.ProjectId).ThenBy(w => w.Date)
            .ToListAsync();
    }

    public async Task<WorkLog> UpsertAsync(WorkLog log)
    {
        var existing = await db.WorkLogs.FirstOrDefaultAsync(w => w.ProjectId == log.ProjectId && w.Date == log.Date);
        if (existing is null)
        {
            db.WorkLogs.Add(log);
        }
        else
        {
            existing.Done = log.Done;
            existing.Plan = log.Plan;
            existing.Issues = log.Issues;
            existing.UpdatedAt = DateTime.UtcNow;
            db.WorkLogs.Update(existing);
            log = existing;
        }
        await db.SaveChangesAsync();
        return log;
    }
}
