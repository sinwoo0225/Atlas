using System.Text.Json;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

public class ActivityLogService(IActivityLogRepository repo)
{
    private static readonly JsonSerializerOptions ChangesJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public async Task<IEnumerable<ActivityLogDto>> GetByProjectAsync(int projectId, int limit)
    {
        // 클라가 무제한 limit 로 DB 폭주시키는 것 방어.
        var bounded = Math.Clamp(limit, 1, 200);
        return (await repo.GetByProjectAsync(projectId, bounded)).Select(ToDto);
    }

    public async Task<IEnumerable<ActivityLogDto>> GetAllAsync(int limit, int offset)
    {
        var boundedLimit = Math.Clamp(limit, 1, 200);
        var boundedOffset = Math.Max(0, offset);
        return (await repo.GetAllAsync(boundedLimit, boundedOffset)).Select(ToDto);
    }

    // RetentionDays > 0 일 때 AppHostFactory startup 에서 한 번 호출.
    public Task<int> PruneAsync(TimeSpan retention) =>
        repo.PruneOlderThanAsync(DateTime.UtcNow - retention);

    private static ActivityLogDto ToDto(ActivityLog a)
    {
        IReadOnlyDictionary<string, ActivityChangeValue>? changed = null;
        if (!string.IsNullOrEmpty(a.ChangesJson))
        {
            try
            {
                changed = JsonSerializer.Deserialize<Dictionary<string, ActivityChangeValue>>(
                    a.ChangesJson, ChangesJsonOptions);
            }
            catch
            {
                // 손상된 JSON 은 null 로 무시 — 기록 자체는 살림.
            }
        }
        return new(a.Id, a.ProjectId, a.EntityType, a.EntityId,
            a.EntityTitle, a.Action, a.Actor, a.Timestamp, changed);
    }
}
