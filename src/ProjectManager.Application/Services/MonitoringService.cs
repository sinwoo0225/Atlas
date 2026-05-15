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

    public async Task<MonitoringChartsDto> GetChartsAsync(int upcomingDays = 30)
    {
        var today = DateTime.Today;
        var horizon = today.AddDays(upcomingDays);

        // 1) 프로젝트 상태 분포
        var statusRaw = await db.Projects
            .GroupBy(p => p.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync();
        int CountOf(ProjectStatus s) => statusRaw.FirstOrDefault(x => x.Status == s)?.Count ?? 0;
        var projectStatus = new ProjectStatusBreakdownDto(
            CountOf(ProjectStatus.Planned),
            CountOf(ProjectStatus.Waiting),
            CountOf(ProjectStatus.InProgress),
            CountOf(ProjectStatus.Done));

        // 2) 이슈 상태×우선순위 매트릭스 (전 상태 포함; Closed 도 시각화로 의미 있음)
        var issueMatrix = (await db.Issues
                .GroupBy(i => new { i.Status, i.Priority })
                .Select(g => new { g.Key.Status, g.Key.Priority, Count = g.Count() })
                .ToListAsync())
            .Select(x => new IssueMatrixCellDto(x.Status, x.Priority, x.Count))
            .ToList();

        // 3) 다가오는 마일스톤 (오늘부터 N일, 미완료, 종료일 오름차순)
        var milestones = await db.WbsItems
            .Where(w => w.IsMilestone
                && w.EndDate.HasValue
                && w.EndDate.Value.Date >= today
                && w.EndDate.Value.Date <= horizon
                && w.Status != WbsStatus.Done)
            .Join(db.Projects, w => w.ProjectId, p => p.Id, (w, p) => new { w, p })
            .OrderBy(x => x.w.EndDate)
            .Select(x => new UpcomingMilestoneDto(
                x.w.Id, x.w.ProjectId, x.p.Name,
                x.w.Name, x.w.EndDate!.Value, x.w.Status))
            .ToListAsync();

        // 4) 프로젝트별 WBS 진행률 (마일스톤 제외, 실제 작업만)
        var wbsRaw = await db.WbsItems
            .Where(w => !w.IsMilestone)
            .Join(db.Projects, w => w.ProjectId, p => p.Id, (w, p) => new { w, p })
            .ToListAsync();
        var wbsProgress = wbsRaw
            .GroupBy(x => new { x.p.Id, x.p.Name, x.p.Status })
            .Select(g =>
            {
                var total = g.Count();
                var done = g.Count(x => x.w.Status == WbsStatus.Done);
                var pct = total == 0 ? 0.0 : Math.Round((double)done * 100.0 / total, 1);
                return new WbsProgressDto(g.Key.Id, g.Key.Name, g.Key.Status, total, done, pct);
            })
            // InProgress 먼저, 그 안에서 진행률 높은 순.
            .OrderBy(x => x.ProjectStatus == ProjectStatus.InProgress ? 0
                : x.ProjectStatus == ProjectStatus.Planned    ? 1
                : x.ProjectStatus == ProjectStatus.Waiting    ? 2 : 3)
            .ThenByDescending(x => x.ProgressPercent)
            .ToList();

        return new MonitoringChartsDto(projectStatus, issueMatrix, milestones, wbsProgress);
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
            // 통합 모니터링은 '한 일'·'이슈' 만 노출하므로, 둘 다 비어 있고 계획만 있는
            // 프로젝트는 카드 자체를 띄우지 않는다.
            .Where(p => p.Days.Any(d =>
                !string.IsNullOrWhiteSpace(d.Done)
                || !string.IsNullOrWhiteSpace(d.Issues)))
            .OrderBy(p => p.ProjectName)
            .ToList();

        return new WeeklyWorkLogDto(start, grouped);
    }
}
