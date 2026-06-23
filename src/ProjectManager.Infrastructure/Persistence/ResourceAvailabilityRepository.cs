using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class ResourceAvailabilityRepository(AppDbContext db) : IResourceAvailabilityRepository
{
    public async Task<IEnumerable<ResourceAvailability>> GetByResourceAsync(int resourceId) =>
        await db.ResourceAvailabilities
            .Where(x => x.ResourceId == resourceId)
            .OrderBy(x => x.StartDate)
            .ToListAsync();

    public async Task<ResourceAvailability?> GetByIdAsync(int id) =>
        await db.ResourceAvailabilities.FindAsync(id);

    public async Task<ResourceAvailability> CreateAsync(ResourceAvailability availability)
    {
        db.ResourceAvailabilities.Add(availability);
        await db.SaveChangesAsync();
        return availability;
    }

    public async Task DeleteAsync(int id)
    {
        var a = await db.ResourceAvailabilities.FindAsync(id);
        if (a is null) return;
        db.ResourceAvailabilities.Remove(a);
        await db.SaveChangesAsync();
    }

    // 구간이 [from, to] 와 겹치면 포함: StartDate <= to && EndDate >= from.
    public async Task<IEnumerable<ResourceAvailability>> GetOverlappingAsync(DateTime fromInclusive, DateTime toInclusive) =>
        await db.ResourceAvailabilities
            .Where(x => x.StartDate <= toInclusive && x.EndDate >= fromInclusive)
            .ToListAsync();
}
