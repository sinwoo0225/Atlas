using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class MeetingRepository(AppDbContext db) : IMeetingRepository
{
    public async Task<IEnumerable<Meeting>> GetByProjectAsync(int projectId, string? keyword = null)
    {
        var query = db.Meetings.Where(x => x.ProjectId == projectId);
        if (!string.IsNullOrWhiteSpace(keyword))
            query = query.Where(x => x.Topic.Contains(keyword) || x.Discussion.Contains(keyword) || x.Decisions.Contains(keyword));
        return await query.OrderByDescending(x => x.Date).ToListAsync();
    }

    public async Task<Meeting?> GetByIdAsync(int id) => await db.Meetings.FindAsync(id);

    public async Task<Meeting> CreateAsync(Meeting meeting)
    {
        db.Meetings.Add(meeting);
        await db.SaveChangesAsync();
        return meeting;
    }

    public async Task<Meeting> UpdateAsync(Meeting meeting)
    {
        meeting.UpdatedAt = DateTime.UtcNow;
        db.Meetings.Update(meeting);
        await db.SaveChangesAsync();
        return meeting;
    }

    public async Task DeleteAsync(int id)
    {
        var item = await db.Meetings.FindAsync(id);
        if (item != null) { db.Meetings.Remove(item); await db.SaveChangesAsync(); }
    }
}
