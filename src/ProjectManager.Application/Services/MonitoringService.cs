using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.Application.Services;

public record TodayWbsDto(
    int WbsItemId, int ProjectId, string ProjectName,
    string WbsItemName, string Assignee,
    DateTime? StartDate, DateTime? EndDate, WbsStatus Status);

public record MonitoringDto(IEnumerable<TodayWbsDto> Items);

public class MonitoringService(AppDbContext db, IWorkLogRepository workLogRepo)
{
    private static readonly string[] DayLabels = { "월", "화", "수", "목", "금" };

    private static string IsoDate(DateTime d) => d.ToString("yyyy-MM-dd");

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

    public async Task<WeeklyWorkLogDto> GetWeeklyWorkLogsAsync(DateTime weekStart)
    {
        var start = WorkLogService.StartOfWeek(weekStart);
        var end = start.AddDays(5);
        var logs = (await workLogRepo.GetAllInRangeAsync(start, end)).ToList();
        var projectIds = logs.Select(l => l.ProjectId).Distinct().ToList();
        var projectNames = await db.Projects
            .Where(p => projectIds.Contains(p.Id))
            .Select(p => new { p.Id, p.Name })
            .ToDictionaryAsync(p => p.Id, p => p.Name);

        var grouped = logs
            .GroupBy(l => l.ProjectId)
            .Select(g =>
            {
                var dayLog = g.ToDictionary(l => (l.Date.Date - start).Days, l => l);
                var days = new List<WeeklyWorkLogDayDto>(5);
                for (var i = 0; i < 5; i++)
                {
                    dayLog.TryGetValue(i, out var log);
                    days.Add(new WeeklyWorkLogDayDto(
                        i,
                        DayLabels[i],
                        IsoDate(start.AddDays(i)),
                        log?.Done ?? string.Empty,
                        log?.Plan ?? string.Empty,
                        log?.Issues ?? string.Empty));
                }
                return new WeeklyWorkLogProjectDto(
                    g.Key,
                    projectNames.TryGetValue(g.Key, out var n) ? n : $"Project #{g.Key}",
                    days);
            })
            .Where(p => p.Days.Any(d =>
                !string.IsNullOrWhiteSpace(d.Done)
                || !string.IsNullOrWhiteSpace(d.Plan)
                || !string.IsNullOrWhiteSpace(d.Issues)))
            .OrderBy(p => p.ProjectName)
            .ToList();

        return new WeeklyWorkLogDto(start, grouped);
    }
}
