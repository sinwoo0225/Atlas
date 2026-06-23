using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class WbsDependencyRepository(AppDbContext db) : IWbsDependencyRepository
{
    // Predecessor.ProjectId 기준 — 서비스가 양 끝점 동일 프로젝트 보장.
    public async Task<IEnumerable<WbsDependency>> GetByProjectAsync(int projectId, int? versionId = null) =>
        await db.WbsDependencies
            .Where(x => x.Predecessor.ProjectId == projectId
                && (versionId == null || x.Predecessor.VersionId == versionId))
            .ToListAsync();

    public async Task<IEnumerable<WbsDependency>> GetByWbsItemAsync(int wbsItemId) =>
        await db.WbsDependencies
            .Where(x => x.PredecessorId == wbsItemId || x.SuccessorId == wbsItemId)
            .Include(x => x.Predecessor)
            .Include(x => x.Successor)
            .ToListAsync();

    public async Task<WbsDependency?> GetAsync(int predecessorId, int successorId) =>
        await db.WbsDependencies
            .FirstOrDefaultAsync(x => x.PredecessorId == predecessorId && x.SuccessorId == successorId);

    public async Task<WbsDependency?> GetByIdAsync(int id) => await db.WbsDependencies.FindAsync(id);

    public async Task<WbsDependency> CreateAsync(WbsDependency dependency)
    {
        db.WbsDependencies.Add(dependency);
        await db.SaveChangesAsync();
        return dependency;
    }

    public async Task<WbsDependency> UpdateAsync(WbsDependency dependency)
    {
        dependency.UpdatedAt = DateTime.UtcNow;
        db.WbsDependencies.Update(dependency);
        await db.SaveChangesAsync();
        return dependency;
    }

    public async Task<bool> DeleteAsync(int predecessorId, int successorId)
    {
        var d = await GetAsync(predecessorId, successorId);
        if (d is null) return false;
        db.WbsDependencies.Remove(d);
        await db.SaveChangesAsync();
        return true;
    }
}
