using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class MeetingRepository(AppDbContext db) : IMeetingRepository
{
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = false };

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

    public async Task<Meeting> UpdateAsync(Meeting meeting, DateTime? expectedUpdatedAt = null)
    {
        if (expectedUpdatedAt is DateTime expected)
            db.Entry(meeting).Property(x => x.UpdatedAt).OriginalValue = expected;
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

    public Task<int> ClearPromotedIssueRefsAsync(int projectId, int issueId) =>
        MutatePromotedAsync(projectId, "promotedIssueId", issueId, (obj, _) =>
        {
            obj.Remove("promotedIssueId");
            return true;
        });

    public Task<int> ClearPromotedWbsRefsAsync(int projectId, int wbsItemId) =>
        MutatePromotedAsync(projectId, "promotedWbsItemId", wbsItemId, (obj, _) =>
        {
            obj.Remove("promotedWbsItemId");
            return true;
        });

    public Task<int> SyncPromotedIssueContentAsync(int projectId, int issueId, string newContent) =>
        MutatePromotedAsync(projectId, "promotedIssueId", issueId, (obj, _) =>
        {
            // 값 같으면 skip — 루프 가드 (Issue.Title 변경이 ActionItem.content 와 이미 같으면 dirty 아님).
            var current = obj["content"]?.GetValue<string>() ?? "";
            if (current == newContent) return false;
            obj["content"] = newContent;
            return true;
        });

    public Task<int> SyncPromotedWbsContentAsync(int projectId, int wbsItemId, string newContent) =>
        MutatePromotedAsync(projectId, "promotedWbsItemId", wbsItemId, (obj, _) =>
        {
            var current = obj["content"]?.GetValue<string>() ?? "";
            if (current == newContent) return false;
            obj["content"] = newContent;
            return true;
        });

    // 회의록 ActionItems JSON 의 promoted{Issue|Wbs}Id == targetId 매칭 ActionItem 에 mutator 적용.
    // SQLite LIKE 로 1차 후보 필터 → JSON 파싱 후 정확 매칭(123 vs 1234 false-positive 방지).
    // mutator 반환 true (dirty) 인 회의록만 SaveChanges → 인터셉터가 Update 자동 로깅.
    private async Task<int> MutatePromotedAsync(
        int projectId, string fieldName, int targetId, Func<JsonObject, JsonValue, bool> mutator)
    {
        var needle = $"\"{fieldName}\":{targetId}";
        var candidates = await db.Meetings
            .Where(m => m.ProjectId == projectId && EF.Functions.Like(m.ActionItems, "%" + needle + "%"))
            .ToListAsync();

        var changedCount = 0;
        foreach (var meeting in candidates)
        {
            JsonArray? items;
            try { items = JsonNode.Parse(meeting.ActionItems) as JsonArray; }
            catch { continue; }
            if (items is null) continue;

            var dirty = false;
            foreach (var node in items)
            {
                if (node is not JsonObject obj) continue;
                if (obj[fieldName] is not JsonValue v) continue;
                if (!v.TryGetValue<int>(out var id) || id != targetId) continue;
                if (mutator(obj, v)) dirty = true;
            }

            if (!dirty) continue;
            meeting.ActionItems = items.ToJsonString(JsonOpts);
            meeting.UpdatedAt = DateTime.UtcNow;
            db.Meetings.Update(meeting);
            changedCount++;
        }

        if (changedCount > 0) await db.SaveChangesAsync();
        return changedCount;
    }
}
