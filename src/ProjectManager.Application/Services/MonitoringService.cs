using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.Application.Services;

public record TodayWbsDto(
    int WbsItemId, int ProjectId, string ProjectName,
    string WbsItemName, string Assignee,
    DateTime? StartDate, DateTime? EndDate, WbsStatus Status);

public record MonitoringDto(IEnumerable<TodayWbsDto> Items);

public class MonitoringService(AppDbContext db)
{
    /// <summary>
    /// 오늘 날짜에 진행중(InProgress)이거나 진행 기간에 포함되는 WBS 작업을 모든 프로젝트에서 조회.
    /// </summary>
    public async Task<MonitoringDto> GetTodayAsync()
    {
        var today = DateTime.Now.Date;
        var tomorrow = today.AddDays(1);

        var items = await db.WbsItems
            .Where(w => w.Status == WbsStatus.InProgress
                || (w.StartDate.HasValue && w.EndDate.HasValue
                    && w.StartDate.Value.Date < tomorrow
                    && w.EndDate.Value.Date >= today
                    && w.Status != WbsStatus.Done))
            .Join(db.Projects, w => w.ProjectId, p => p.Id, (w, p) => new { w, p })
            .OrderBy(x => x.p.Name)
            .ThenBy(x => x.w.EndDate)
            .ToListAsync();

        var dtos = items.Select(x => new TodayWbsDto(
            x.w.Id, x.w.ProjectId, x.p.Name,
            x.w.Name, x.w.Assignee,
            x.w.StartDate, x.w.EndDate, x.w.Status));

        return new MonitoringDto(dtos);
    }
}
