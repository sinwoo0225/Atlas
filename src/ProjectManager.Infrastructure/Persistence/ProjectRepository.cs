using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class ProjectRepository(AppDbContext db) : IProjectRepository
{
    public async Task<IEnumerable<Project>> GetAllAsync() =>
        await db.Projects.OrderByDescending(p => p.UpdatedAt).ToListAsync();

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
