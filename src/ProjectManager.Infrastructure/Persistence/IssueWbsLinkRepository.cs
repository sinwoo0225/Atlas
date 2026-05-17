using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class IssueWbsLinkRepository(AppDbContext db) : IIssueWbsLinkRepository
{
    public async Task<IEnumerable<IssueWbsLink>> GetByIssueAsync(int issueId) =>
        await db.IssueWbsLinks
            .Where(x => x.IssueId == issueId)
            .Include(x => x.WbsItem)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync();

    public async Task<IEnumerable<IssueWbsLink>> GetByWbsItemAsync(int wbsItemId) =>
        await db.IssueWbsLinks
            .Where(x => x.WbsItemId == wbsItemId)
            .Include(x => x.Issue)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync();

    public async Task<IssueWbsLink?> GetAsync(int issueId, int wbsItemId) =>
        await db.IssueWbsLinks.FirstOrDefaultAsync(x => x.IssueId == issueId && x.WbsItemId == wbsItemId);

    public async Task<IssueWbsLink?> GetByIdAsync(int id) => await db.IssueWbsLinks.FindAsync(id);

    public async Task<IssueWbsLink> CreateAsync(IssueWbsLink link)
    {
        db.IssueWbsLinks.Add(link);
        await db.SaveChangesAsync();
        return link;
    }

    public async Task<IssueWbsLink> UpdateAsync(IssueWbsLink link)
    {
        link.UpdatedAt = DateTime.UtcNow;
        db.IssueWbsLinks.Update(link);
        await db.SaveChangesAsync();
        return link;
    }

    public async Task<bool> DeleteAsync(int issueId, int wbsItemId)
    {
        var link = await GetAsync(issueId, wbsItemId);
        if (link is null) return false;
        db.IssueWbsLinks.Remove(link);
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<IReadOnlyList<(int IssueId, int WbsItemId)>> GetByProjectAsync(int projectId)
    {
        // Issue.ProjectId 기준 join — IssueWbsLinkService.CreateAsync 가 Issue/WBS ProjectId 동일 보장.
        var rows = await db.IssueWbsLinks
            .Where(l => l.Issue!.ProjectId == projectId)
            .Select(l => new { l.IssueId, l.WbsItemId })
            .ToListAsync();
        return rows.Select(r => (r.IssueId, r.WbsItemId)).ToList();
    }
}
