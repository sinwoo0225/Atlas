using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class IssueRepository(AppDbContext db) : IIssueRepository
{
    public async Task<IEnumerable<Issue>> GetByProjectAsync(int projectId) =>
        await db.Issues
            .Where(x => x.ProjectId == projectId)
            .Include(x => x.AssigneeResource)
            .OrderByDescending(x => x.UpdatedAt)
            .ToListAsync();

    public async Task<Issue?> GetByIdAsync(int id) =>
        await db.Issues
            .Include(x => x.AssigneeResource)
            .FirstOrDefaultAsync(x => x.Id == id);

    public async Task<Issue> CreateAsync(Issue issue)
    {
        db.Issues.Add(issue);
        await db.SaveChangesAsync();
        return issue;
    }

    public async Task<Issue> UpdateAsync(Issue issue)
    {
        issue.UpdatedAt = DateTime.UtcNow;
        db.Issues.Update(issue);
        await db.SaveChangesAsync();
        return issue;
    }

    public async Task DeleteAsync(int id)
    {
        var i = await db.Issues.FindAsync(id);
        if (i != null)
        {
            db.Issues.Remove(i);
            await db.SaveChangesAsync();
        }
    }
}
