using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

public class ActivityLogService(IActivityLogRepository repo)
{
    public async Task<IEnumerable<ActivityLogDto>> GetByProjectAsync(int projectId, int limit)
    {
        // 클라가 무제한 limit 로 DB 폭주시키는 것 방어.
        var bounded = Math.Clamp(limit, 1, 200);
        return (await repo.GetByProjectAsync(projectId, bounded)).Select(ToDto);
    }

    private static ActivityLogDto ToDto(ActivityLog a) => new(
        a.Id, a.ProjectId, a.EntityType, a.EntityId,
        a.EntityTitle, a.Action, a.Actor, a.Timestamp);
}
