using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class WbsAssignmentRepository(AppDbContext db) : IWbsAssignmentRepository
{
    public async Task<IEnumerable<WbsAssignment>> GetByWbsItemAsync(int wbsItemId) =>
        await db.WbsAssignments
            .Where(x => x.WbsItemId == wbsItemId)
            .Include(x => x.Resource)
            .OrderBy(x => x.Id)
            .ToListAsync();

    public async Task<IEnumerable<WbsAssignment>> GetByResourceAsync(int resourceId) =>
        await db.WbsAssignments
            .Where(x => x.ResourceId == resourceId)
            .Include(x => x.WbsItem)
            .ToListAsync();

    public async Task<WbsAssignment?> GetAsync(int wbsItemId, int resourceId) =>
        await db.WbsAssignments
            .Include(x => x.Resource)
            .FirstOrDefaultAsync(x => x.WbsItemId == wbsItemId && x.ResourceId == resourceId);

    public async Task<WbsAssignment> CreateAsync(WbsAssignment assignment)
    {
        db.WbsAssignments.Add(assignment);
        await db.SaveChangesAsync();
        return assignment;
    }

    public async Task<WbsAssignment> UpdateAsync(WbsAssignment assignment)
    {
        assignment.UpdatedAt = DateTime.UtcNow;
        db.WbsAssignments.Update(assignment);
        await db.SaveChangesAsync();
        return assignment;
    }

    public async Task<bool> DeleteAsync(int wbsItemId, int resourceId)
    {
        var a = await db.WbsAssignments.FirstOrDefaultAsync(x => x.WbsItemId == wbsItemId && x.ResourceId == resourceId);
        if (a is null) return false;
        db.WbsAssignments.Remove(a);
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<IEnumerable<WbsAssignment>> GetByProjectAsync(int projectId, int? versionId = null) =>
        await db.WbsAssignments
            .Where(x => x.WbsItem.ProjectId == projectId
                && (versionId == null || x.WbsItem.VersionId == versionId))
            .Include(x => x.Resource)
            .Include(x => x.WbsItem)
            .ToListAsync();
}
