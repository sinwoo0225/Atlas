using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class TodoRepository(AppDbContext db) : ITodoRepository
{
    public async Task<IEnumerable<TodoItem>> GetAllAsync(TodoListFilter? filter = null)
    {
        var f = filter ?? TodoListFilter.None;
        var q = db.TodoItems.Include(x => x.AssigneeResource).AsQueryable();

        if (f.Statuses is { Count: > 0 })
        {
            var statuses = f.Statuses.ToArray();
            q = q.Where(x => statuses.Contains(x.Status));
        }
        else if (f.Open)
        {
            q = q.Where(x => x.Status == TodoStatus.Open);
        }
        if (f.AssigneeResourceId is int rid)
            q = q.Where(x => x.AssigneeResourceId == rid);
        if (!string.IsNullOrWhiteSpace(f.Keyword))
        {
            var kw = f.Keyword;
            q = q.Where(x => x.Title.Contains(kw) || x.Notes.Contains(kw));
        }

        // 미완 먼저, 마감일 가까운 순(null 마지막), 그 다음 SortOrder.
        return await q
            .OrderBy(x => x.Status == TodoStatus.Done ? 1 : 0)
            .ThenBy(x => x.DueDate ?? DateTime.MaxValue)
            .ThenBy(x => x.SortOrder)
            .ToListAsync();
    }

    public async Task<TodoItem?> GetByIdAsync(int id) =>
        await db.TodoItems.Include(x => x.AssigneeResource).FirstOrDefaultAsync(x => x.Id == id);

    public async Task<TodoItem> CreateAsync(TodoItem item)
    {
        db.TodoItems.Add(item);
        await db.SaveChangesAsync();
        return item;
    }

    public async Task<TodoItem> UpdateAsync(TodoItem item, DateTime? expectedUpdatedAt = null)
    {
        // 동시성 토큰 — WbsRepository.UpdateAsync 와 동일.
        if (expectedUpdatedAt is DateTime expected)
            db.Entry(item).Property(x => x.UpdatedAt).OriginalValue = expected;
        item.UpdatedAt = DateTime.UtcNow;
        db.TodoItems.Update(item);
        await db.SaveChangesAsync();
        return item;
    }

    public async Task DeleteAsync(int id)
    {
        var item = await db.TodoItems.FindAsync(id);
        if (item != null)
        {
            db.TodoItems.Remove(item);
            await db.SaveChangesAsync();
        }
    }

    public async Task<IEnumerable<TodoItem>> GetOpenAsync(int? assigneeResourceId = null)
    {
        var q = db.TodoItems.Where(x => x.Status == TodoStatus.Open);
        if (assigneeResourceId is int rid)
            q = q.Where(x => x.AssigneeResourceId == rid);
        return await q.Include(x => x.AssigneeResource).ToListAsync();
    }
}
