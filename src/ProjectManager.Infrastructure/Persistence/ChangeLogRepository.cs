using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class ChangeLogRepository(AppDbContext db) : IChangeLogRepository
{
    public async Task<IEnumerable<ChangeLog>> GetByProjectAsync(int projectId, ChangeLogListFilter? filter = null)
    {
        var f = filter ?? ChangeLogListFilter.None;
        var q = db.ChangeLogs.Where(x => x.ProjectId == projectId);

        if (f.Impacts is { Count: > 0 })
        {
            var impacts = f.Impacts.ToArray();
            q = q.Where(x => impacts.Contains(x.Impact));
        }
        if (f.From is DateTime from)
            q = q.Where(x => x.Date >= from);
        if (f.To is DateTime to)
        {
            var end = to.Date.AddDays(1);
            q = q.Where(x => x.Date < end);
        }
        if (f.SourceIssueId is int si)
            q = q.Where(x => x.SourceIssueId == si);
        if (f.SourceWbsItemId is int sw)
            q = q.Where(x => x.SourceWbsItemId == sw);
        if (!string.IsNullOrWhiteSpace(f.Keyword))
        {
            var kw = f.Keyword;
            q = q.Where(x => x.Content.Contains(kw));
        }

        return await q
            .Include(x => x.SourceIssue)
            .Include(x => x.SourceWbsItem)
            .OrderByDescending(x => x.Date)
            .ToListAsync();
    }

    public async Task<ChangeLog?> GetByIdAsync(int id) =>
        await db.ChangeLogs
            .Include(x => x.SourceIssue)
            .Include(x => x.SourceWbsItem)
            .FirstOrDefaultAsync(x => x.Id == id);

    public async Task<ChangeLog> CreateAsync(ChangeLog log)
    {
        db.ChangeLogs.Add(log);
        await db.SaveChangesAsync();
        return log;
    }

    public async Task<ChangeLog> UpdateAsync(ChangeLog log, DateTime? expectedUpdatedAt = null)
    {
        if (expectedUpdatedAt is DateTime expected)
            db.Entry(log).Property(x => x.UpdatedAt).OriginalValue = expected;
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

    public async Task<(IReadOnlyDictionary<int, int> ByIssueId, IReadOnlyDictionary<int, int> ByWbsItemId)>
        GetSourceCountsAsync(int projectId)
    {
        // 두 GroupBy 를 별도 쿼리로 (각각 single SourceXxxId 필터 + count). SQLite 단순 select count.
        var byIssue = await db.ChangeLogs
            .Where(c => c.ProjectId == projectId && c.SourceIssueId != null)
            .GroupBy(c => c.SourceIssueId!.Value)
            .Select(g => new { Id = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Id, x => x.Count);

        var byWbs = await db.ChangeLogs
            .Where(c => c.ProjectId == projectId && c.SourceWbsItemId != null)
            .GroupBy(c => c.SourceWbsItemId!.Value)
            .Select(g => new { Id = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Id, x => x.Count);

        return (byIssue, byWbs);
    }
}
