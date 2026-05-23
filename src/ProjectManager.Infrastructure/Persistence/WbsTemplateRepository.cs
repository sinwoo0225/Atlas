using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class WbsTemplateRepository(AppDbContext db) : IWbsTemplateRepository
{
    public async Task<IEnumerable<WbsTemplate>> GetAllAsync() =>
        await db.WbsTemplates.OrderBy(x => x.Name).ToListAsync();

    public async Task<WbsTemplate?> GetByIdAsync(int id) =>
        await db.WbsTemplates.FindAsync(id);

    public async Task<WbsTemplate> CreateAsync(WbsTemplate template)
    {
        db.WbsTemplates.Add(template);
        await db.SaveChangesAsync();
        return template;
    }

    public async Task<WbsTemplate> UpdateAsync(WbsTemplate template, DateTime? expectedUpdatedAt = null)
    {
        // 동시성 토큰 — WbsRepository.UpdateAsync 패턴.
        if (expectedUpdatedAt is DateTime expected)
            db.Entry(template).Property(x => x.UpdatedAt).OriginalValue = expected;
        template.UpdatedAt = DateTime.UtcNow;
        db.WbsTemplates.Update(template);
        await db.SaveChangesAsync();
        return template;
    }

    public async Task DeleteAsync(int id)
    {
        var item = await db.WbsTemplates.FindAsync(id);
        if (item != null)
        {
            db.WbsTemplates.Remove(item);
            await db.SaveChangesAsync();
        }
    }
}
