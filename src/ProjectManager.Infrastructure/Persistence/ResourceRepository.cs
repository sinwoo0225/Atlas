using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class ResourceRepository(AppDbContext db) : IResourceRepository
{
    public async Task<IEnumerable<Resource>> GetAllAsync() =>
        await db.Resources.OrderBy(r => r.Name).ToListAsync();

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
