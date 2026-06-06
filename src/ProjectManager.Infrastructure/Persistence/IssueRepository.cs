using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class IssueRepository(AppDbContext db) : IIssueRepository
{
    public async Task<IEnumerable<Issue>> GetByProjectAsync(int projectId, IssueListFilter? filter = null)
    {
        var f = filter ?? IssueListFilter.None;
        var q = db.Issues.Where(x => x.ProjectId == projectId);

        if (f.Statuses is { Count: > 0 })
        {
            var statuses = f.Statuses.ToArray();
            q = q.Where(x => statuses.Contains(x.Status));
        }
        if (f.Priorities is { Count: > 0 })
        {
            var priorities = f.Priorities.ToArray();
            q = q.Where(x => priorities.Contains(x.Priority));
        }
        if (f.AssigneeResourceId is int aid)
            q = q.Where(x => x.AssigneeResourceId == aid);
        if (!string.IsNullOrWhiteSpace(f.AssigneeName))
        {
            var name = f.AssigneeName;
            q = q.Where(x => x.AssigneeResource != null && x.AssigneeResource.Name.Contains(name));
        }
        if (f.DueFrom is DateTime df)
            q = q.Where(x => x.DueDate != null && x.DueDate >= df);
        if (f.DueTo is DateTime dt)
        {
            var end = dt.Date.AddDays(1); // half-open: 그 날 전체 포함
            q = q.Where(x => x.DueDate != null && x.DueDate < end);
        }
        if (f.OccurredFrom is DateTime of)
            q = q.Where(x => x.OccurredOn != null && x.OccurredOn >= of);
        if (f.OccurredTo is DateTime ot)
        {
            var end = ot.Date.AddDays(1);
            q = q.Where(x => x.OccurredOn != null && x.OccurredOn < end);
        }
        if (f.Overdue)
        {
            var today = DateTime.Today;
            q = q.Where(x => x.DueDate != null && x.DueDate < today
                && x.Status != IssueStatus.Resolved && x.Status != IssueStatus.Closed);
        }
        if (!string.IsNullOrWhiteSpace(f.Keyword))
        {
            var kw = f.Keyword;
            q = q.Where(x => x.Title.Contains(kw) || x.Description.Contains(kw));
        }

        return await q
            .Include(x => x.AssigneeResource)
            .OrderByDescending(x => x.UpdatedAt)
            .ToListAsync();
    }

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

    public async Task<IEnumerable<Issue>> GetOpenAcrossProjectsAsync() =>
        await db.Issues
            .Where(x => x.Status == IssueStatus.Open || x.Status == IssueStatus.InProgress)
            .Include(x => x.AssigneeResource)
            .Include(x => x.Project)
            .ToListAsync();
}
