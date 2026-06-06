using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class ResourceRepository(AppDbContext db) : IResourceRepository
{
    public async Task<IEnumerable<Resource>> GetAllAsync(ResourceListFilter? filter = null)
    {
        var f = filter ?? ResourceListFilter.None;
        var q = db.Resources.AsQueryable();

        if (f.Type is ResourceType t)
            q = q.Where(x => x.Type == t);
        if (!string.IsNullOrWhiteSpace(f.Department))
        {
            var dept = f.Department;
            q = q.Where(x => x.Department.Contains(dept));
        }
        if (!string.IsNullOrWhiteSpace(f.Keyword))
        {
            var kw = f.Keyword;
            q = q.Where(x => x.Name.Contains(kw) || x.Email.Contains(kw));
        }

        return await q.OrderBy(r => r.Name).ToListAsync();
    }

    public async Task<Resource?> GetByIdAsync(int id) => await db.Resources.FindAsync(id);

    public async Task<Resource> CreateAsync(Resource resource)
    {
        db.Resources.Add(resource);
        await db.SaveChangesAsync();
        return resource;
    }

    public async Task<Resource> UpdateAsync(Resource resource)
    {
        resource.UpdatedAt = DateTime.UtcNow;
        db.Resources.Update(resource);
        await db.SaveChangesAsync();
        return resource;
    }

    public async Task DeleteAsync(int id)
    {
        var r = await db.Resources.FindAsync(id);
        if (r != null)
        {
            db.Resources.Remove(r);
            await db.SaveChangesAsync();
        }
    }
}
