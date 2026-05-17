using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class ActivityLogRepository(AppDbContext db) : IActivityLogRepository
{
    public async Task<IEnumerable<ActivityLogWithProject>> GetByProjectAsync(int projectId, int limit)
    {
        var logs = await db.ActivityLogs
            .Where(x => x.ProjectId == projectId)
            .OrderByDescending(x => x.Timestamp)
            .Take(limit)
            .ToListAsync();
        return await AttachProjectNamesAsync(logs);
    }

    public async Task<IEnumerable<ActivityLogWithProject>> GetAllAsync(ActivityFilter f)
    {
        var q = db.ActivityLogs.AsQueryable();

        if (f.ProjectId.HasValue)
            q = q.Where(x => x.ProjectId == f.ProjectId.Value);

        if (f.EntityTypes is { Count: > 0 })
        {
            var types = f.EntityTypes.ToArray();
            q = q.Where(x => types.Contains(x.EntityType));
        }

        if (f.Actions is { Count: > 0 })
        {
            var actions = f.Actions.ToArray();
            q = q.Where(x => actions.Contains(x.Action));
        }

        if (f.FromUtc.HasValue)
            q = q.Where(x => x.Timestamp >= f.FromUtc.Value);

        if (f.ToUtc.HasValue)
            q = q.Where(x => x.Timestamp < f.ToUtc.Value);

        var logs = await q
            .OrderByDescending(x => x.Timestamp)
            .Skip(f.Offset)
            .Take(f.Limit)
            .ToListAsync();
        return await AttachProjectNamesAsync(logs);
    }

    // ActivityLog.ProjectId 는 nullable 이고 Project FK 가 cascade 하지 않아서 (orphan 보존)
    // EF LEFT JOIN 으로 한 번에 가져오기 어렵다. 단순한 2-쿼리 패턴으로 ProjectName 만 lookup.
    private async Task<IReadOnlyList<ActivityLogWithProject>> AttachProjectNamesAsync(IReadOnlyList<ActivityLog> logs)
    {
        var ids = logs
            .Where(l => l.ProjectId.HasValue)
            .Select(l => l.ProjectId!.Value)
            .Distinct()
            .ToList();
        var nameById = ids.Count == 0
            ? new Dictionary<int, string>()
            : await db.Projects
                .Where(p => ids.Contains(p.Id))
                .ToDictionaryAsync(p => p.Id, p => p.Name);
        return logs
            .Select(l => new ActivityLogWithProject(
                l,
                l.ProjectId.HasValue && nameById.TryGetValue(l.ProjectId.Value, out var n) ? n : null))
            .ToList();
    }

    // 모니터링 '프로젝트별 활동량' 위젯 — sinceUtc 이후 활동 카운트, count DESC.
    public async Task<IReadOnlyList<(int ProjectId, string ProjectName, int Count)>>
        GetCountsByProjectAsync(DateTime sinceUtc, int top)
    {
        var rows = await (
            from a in db.ActivityLogs
            where a.Timestamp >= sinceUtc && a.ProjectId != null
            join p in db.Projects on a.ProjectId!.Value equals p.Id
            group p by new { ProjectId = a.ProjectId!.Value, p.Name } into g
            orderby g.Count() descending
            select new { g.Key.ProjectId, ProjectName = g.Key.Name, Count = g.Count() })
            .Take(top)
            .ToListAsync();
        return rows
            .Select(r => (r.ProjectId, r.ProjectName, r.Count))
            .ToList();
    }

    public Task<int> PruneOlderThanAsync(DateTime cutoffUtc) =>
        db.ActivityLogs.Where(x => x.Timestamp < cutoffUtc).ExecuteDeleteAsync();

    public async Task<bool> RewriteLatestActionAsync(
        string entityType, int entityId, ActivityAction expected, ActivityAction next)
    {
        var row = await db.ActivityLogs
            .Where(l => l.EntityType == entityType && l.EntityId == entityId && l.Action == expected)
            .OrderByDescending(l => l.Id)
            .FirstOrDefaultAsync();
        if (row is null) return false;
        row.Action = next;
        // ActivityLog 자체는 IAuditable 이 아니므로 인터셉터의 IAuditable 가드(line 110)에 걸려 재로깅되지 않는다.
        await db.SaveChangesAsync();
        return true;
    }
}
