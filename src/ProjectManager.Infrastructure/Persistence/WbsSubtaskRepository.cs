using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class WbsSubtaskRepository(AppDbContext db) : IWbsSubtaskRepository
{
    public async Task<IEnumerable<WbsSubtask>> GetByWbsItemAsync(int wbsItemId) =>
        await db.WbsSubtasks
            .Where(x => x.WbsItemId == wbsItemId)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Id)
            .ToListAsync();

    public async Task<WbsSubtask?> GetByIdAsync(int id) =>
        await db.WbsSubtasks.FirstOrDefaultAsync(x => x.Id == id);

    public async Task<WbsSubtask> CreateAsync(WbsSubtask subtask)
    {
        db.WbsSubtasks.Add(subtask);
        await db.SaveChangesAsync();
        return subtask;
    }

    public async Task<WbsSubtask> UpdateAsync(WbsSubtask subtask)
    {
        subtask.UpdatedAt = DateTime.UtcNow;
        db.WbsSubtasks.Update(subtask);
        await db.SaveChangesAsync();
        return subtask;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var s = await db.WbsSubtasks.FirstOrDefaultAsync(x => x.Id == id);
        if (s is null) return false;
        db.WbsSubtasks.Remove(s);
        await db.SaveChangesAsync();
        return true;
    }
}
