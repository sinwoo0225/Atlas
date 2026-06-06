using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class ProjectRepository(AppDbContext db) : IProjectRepository
{
    public async Task<IEnumerable<Project>> GetAllAsync(ProjectListFilter? filter = null)
    {
        var f = filter ?? ProjectListFilter.None;
        var q = db.Projects.AsQueryable();

        if (f.Statuses is { Count: > 0 })
        {
            var statuses = f.Statuses.ToArray();
            q = q.Where(x => statuses.Contains(x.Status));
        }
        if (f.ActiveOn is DateTime d)
        {
            var dStart = d.Date;
            var dEnd = d.Date.AddDays(1);
            q = q.Where(x => (x.StartDate == null || x.StartDate < dEnd)
                          && (x.EndDate == null || x.EndDate >= dStart));
        }
        if (f.StartFrom is DateTime sf)
            q = q.Where(x => x.StartDate != null && x.StartDate >= sf);
        if (f.StartTo is DateTime sto)
        {
            var end = sto.Date.AddDays(1);
            q = q.Where(x => x.StartDate != null && x.StartDate < end);
        }
        if (f.EndFrom is DateTime ef)
            q = q.Where(x => x.EndDate != null && x.EndDate >= ef);
        if (f.EndTo is DateTime eto)
        {
            var end = eto.Date.AddDays(1);
            q = q.Where(x => x.EndDate != null && x.EndDate < end);
        }
        if (!string.IsNullOrWhiteSpace(f.Category))
        {
            var cat = f.Category;
            q = q.Where(x => x.Category.Contains(cat));
        }
        if (!string.IsNullOrWhiteSpace(f.Keyword))
        {
            var kw = f.Keyword;
            q = q.Where(x => x.Name.Contains(kw) || x.Description.Contains(kw) || x.Goal.Contains(kw));
        }

        return await q.OrderByDescending(p => p.UpdatedAt).ToListAsync();
    }

    public async Task<Project?> GetByIdAsync(int id) =>
        await db.Projects.FindAsync(id);

    public async Task<Project> CreateAsync(Project project)
    {
        db.Projects.Add(project);
        await db.SaveChangesAsync();
        return project;
    }

    public async Task<Project> UpdateAsync(Project project)
    {
        project.UpdatedAt = DateTime.UtcNow;
        db.Projects.Update(project);
        await db.SaveChangesAsync();
        return project;
    }

    public async Task DeleteAsync(int id)
    {
        var p = await db.Projects.FindAsync(id);
        if (p != null)
        {
            db.Projects.Remove(p);
            await db.SaveChangesAsync();
        }
    }
}
