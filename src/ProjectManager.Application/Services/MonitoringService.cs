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
                var done = JoinByDays(dayLog, l => l.Done);
                var plan = JoinByDays(dayLog, l => l.Plan);
                var issues = JoinByDays(dayLog, l => l.Issues);
                return new WeeklyWorkLogProjectDto(
                    g.Key,
                    projectNames.TryGetValue(g.Key, out var n) ? n : $"Project #{g.Key}",
                    done, plan, issues);
            })
            .Where(p => !(string.IsNullOrWhiteSpace(p.Done) && string.IsNullOrWhiteSpace(p.Plan) && string.IsNullOrWhiteSpace(p.Issues)))
            .OrderBy(p => p.ProjectName)
            .ToList();

        return new WeeklyWorkLogDto(start, grouped);
    }

    private static string JoinByDays(Dictionary<int, WorkLog> dayLog, Func<WorkLog, string> selector)
    {
        var lines = new List<string>();
        for (var i = 0; i < 5; i++)
        {
            if (!dayLog.TryGetValue(i, out var log)) continue;
            var content = selector(log);
            if (string.IsNullOrWhiteSpace(content)) continue;
            var label = DayLabels[i];
            foreach (var raw in content.Replace("\r\n", "\n").Split('\n'))
            {
                var trimmed = raw.TrimEnd();
                if (string.IsNullOrWhiteSpace(trimmed)) continue;
                if (trimmed.StartsWith("- ") || trimmed.StartsWith("* "))
                {
                    var prefix = trimmed.Substring(0, 2);
                    var rest = trimmed.Substring(2);
                    lines.Add($"{prefix}({label}) {rest}");
                }
                else
                {
                    lines.Add($"- ({label}) {trimmed}");
                }
            }
        }
        return string.Join("\n", lines);
    }
}
