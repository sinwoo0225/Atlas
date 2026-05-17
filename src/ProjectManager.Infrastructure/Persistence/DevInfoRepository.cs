using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Infrastructure.Persistence;

public class DevInfoRepository(AppDbContext db) : IDevInfoRepository
{
    public async Task<IEnumerable<DevInfoItem>> GetByProjectAsync(int projectId) =>
        await db.DevInfoItems.Where(x => x.ProjectId == projectId).OrderByDescending(x => x.UpdatedAt).ToListAsync();

    public async Task<DevInfoItem?> GetByIdAsync(int id) => await db.DevInfoItems.FindAsync(id);

    public async Task<DevInfoItem> CreateAsync(DevInfoItem item)
    {
        db.DevInfoItems.Add(item);
        await db.SaveChangesAsync();
        return item;
    }

    public async Task<DevInfoItem> UpdateAsync(DevInfoItem item)
    {
        item.UpdatedAt = DateTime.UtcNow;
        db.DevInfoItems.Update(item);
        await db.SaveChangesAsync();
        return item;
    }

    public async Task DeleteAsync(int id)
    {
        var item = await db.DevInfoItems.FindAsync(id);
        if (item != null) { db.DevInfoItems.Remove(item); await db.SaveChangesAsync(); }
    }

    public async Task<IReadOnlyList<string>> GetTagsByProjectAsync(int projectId) =>
        await db.DevInfoItems
            .Where(x => x.ProjectId == projectId && x.Tags != "")
            .Select(x => x.Tags)
            .ToListAsync();

    public Task<int> RenameTagAsync(int projectId, string oldTag, string newTag) =>
        MutateTagsAsync(projectId, new[] { oldTag }, newTag);

    public Task<int> MergeTagsAsync(int projectId, IReadOnlyList<string> sourceTags, string targetTag) =>
        MutateTagsAsync(projectId, sourceTags, targetTag);

    // sources 중 하나라도 매칭되면 target 으로 치환 + dedup (OrdinalIgnoreCase).
    // 빈 트림 / target == sources 모두 동일이면 no-op. dirty 만 SaveChanges (인터셉터가 Update 자동 로깅).
    private async Task<int> MutateTagsAsync(int projectId, IEnumerable<string> sourceTags, string targetTag)
    {
        var sources = sourceTags
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var target = (targetTag ?? "").Trim();
        if (sources.Count == 0 || string.IsNullOrEmpty(target)) return 0;

        // target 이 sources 중 하나면 그 항목만 매칭에서 빼고 나머지 → target (자기 치환 방지)
        sources.Remove(target);
        if (sources.Count == 0) return 0;

        var items = await db.DevInfoItems.Where(x => x.ProjectId == projectId).ToListAsync();
        var changed = 0;
        foreach (var item in items)
        {
            if (string.IsNullOrWhiteSpace(item.Tags)) continue;
            var tokens = item.Tags
                .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                .ToList();
            var matched = tokens.Any(t => sources.Contains(t));
            if (!matched) continue;
            // sources 매칭은 target 으로 치환, dedup 은 OrdinalIgnoreCase. 첫 등장 표기 보존.
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var rebuilt = new List<string>();
            foreach (var t in tokens)
            {
                var resolved = sources.Contains(t) ? target : t;
                if (seen.Add(resolved)) rebuilt.Add(resolved);
            }
            var next = string.Join(", ", rebuilt);
            if (next == item.Tags) continue;
            item.Tags = next;
            item.UpdatedAt = DateTime.UtcNow;
            db.DevInfoItems.Update(item);
            changed++;
        }
        if (changed > 0) await db.SaveChangesAsync();
        return changed;
    }
}
