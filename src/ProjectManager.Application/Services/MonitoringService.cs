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

public class MonitoringService(AppDbContext db, IWorkLogRepository workLogRepo, IActivityLogRepository activityRepo)
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

        // 5) 상태 분포 위젯 우측 리스트 — 전체 프로젝트 × 진행률(=WBS 진행률 재사용) + EndDate.
        // 활성(InProgress/Waiting) 먼저, 그 안에서 마감 임박 순. WBS 가 없는 프로젝트는 진행률 0.
        var progressById = wbsProgress.ToDictionary(p => p.ProjectId, p => p.ProgressPercent);
        var projectList = await db.Projects
            .Select(p => new { p.Id, p.Name, p.Status, p.EndDate })
            .ToListAsync();
        var projects = projectList
            .Select(p => new ProjectStatusItemDto(
                p.Id, p.Name, p.Status,
                progressById.TryGetValue(p.Id, out var pct) ? pct : 0.0,
                p.EndDate))
            .OrderBy(x => x.Status switch
            {
                ProjectStatus.InProgress => 0,
                ProjectStatus.Waiting    => 1,
                ProjectStatus.Planned    => 2,
                _                         => 3,
            })
            .ThenBy(x => x.EndDate ?? DateTime.MaxValue)
            .ThenBy(x => x.ProjectName, StringComparer.CurrentCulture)
            .ToList();

        return new MonitoringChartsDto(projectStatus, projects, issueMatrix, milestones, wbsProgress);
    }

    // '프로젝트별 활동량' 위젯 — 최근 N일 동안 ActivityLog 카운트, top K.
    // days 기본 30, top 기본 20. 컨트롤러에서 clamp.
    public async Task<IEnumerable<ActivityByProjectDto>> GetActivityByProjectAsync(int days, int top)
    {
        var since = DateTime.UtcNow - TimeSpan.FromDays(days);
        var rows = await activityRepo.GetCountsByProjectAsync(since, top);
        return rows.Select(r => new ActivityByProjectDto(r.ProjectId, r.ProjectName, r.Count));
    }

    // D-1 리소스 히트맵: 이번 주 월요일부터 8주, 담당자별 미완료 항목 마감 카운트.
    // WBS Assignee 는 콤마 분리 문자열, Issue 는 AssigneeResource FK — 같은 문자열이면 같은 행으로 합산.
    // 담당자 미지정 항목은 행에서 제외하고 UnassignedItems 카운트로만 노출.
    public async Task<ResourceHeatmapDto> GetResourceHeatmapAsync()
    {
        const int weeks = 8;

        var weekStart0 = WorkLogService.StartOfWeek(DateTime.Today);
        var horizon = weekStart0.AddDays(weeks * 7);
        var weekStarts = Enumerable.Range(0, weeks)
            .Select(i => IsoDate(weekStart0.AddDays(i * 7)))
            .ToList();

        var wbsItems = await db.WbsItems
            .Where(w => w.EndDate.HasValue
                && w.EndDate.Value.Date >= weekStart0
                && w.EndDate.Value.Date < horizon
                && w.Status != WbsStatus.Done)
            .Join(db.Projects, w => w.ProjectId, p => p.Id, (w, p) => new { w, p })
            .ToListAsync();

        var issueItems = await db.Issues
            .Where(i => i.DueDate.HasValue
                && i.DueDate.Value.Date >= weekStart0
                && i.DueDate.Value.Date < horizon
                && (i.Status == IssueStatus.Open || i.Status == IssueStatus.InProgress))
            .Include(i => i.AssigneeResource)
            .Join(db.Projects, i => i.ProjectId, p => p.Id, (i, p) => new { i, p })
            .ToListAsync();

        var rows = new Dictionary<string, (int[] counts, List<ResourceHeatmapItem> items)>();
        (int[] counts, List<ResourceHeatmapItem> items) RowOf(string key)
        {
            if (!rows.TryGetValue(key, out var row))
            {
                row = (new int[weeks], new List<ResourceHeatmapItem>());
                rows[key] = row;
            }
            return row;
        }

        int total = 0;
        int unassigned = 0;
        foreach (var x in wbsItems)
        {
            var weekIdx = (int)((x.w.EndDate!.Value.Date - weekStart0).TotalDays / 7);
            if (weekIdx < 0 || weekIdx >= weeks) continue;
            total++;
            var assignees = SplitAssignees(x.w.Assignee).ToList();
            if (assignees.Count == 0)
            {
                unassigned++;
                continue;
            }
            foreach (var name in assignees)
            {
                var row = RowOf(name);
                row.counts[weekIdx]++;
                row.items.Add(new ResourceHeatmapItem(
                    weekIdx, "wbs", x.w.Id, x.w.ProjectId, x.p.Name,
                    x.w.Name, IsoDate(x.w.EndDate.Value)));
            }
        }

        foreach (var x in issueItems)
        {
            var weekIdx = (int)((x.i.DueDate!.Value.Date - weekStart0).TotalDays / 7);
            if (weekIdx < 0 || weekIdx >= weeks) continue;
            total++;
            if (string.IsNullOrWhiteSpace(x.i.AssigneeResource?.Name))
            {
                unassigned++;
                continue;
            }
            var name = x.i.AssigneeResource!.Name.Trim();
            var row = RowOf(name);
            row.counts[weekIdx]++;
            row.items.Add(new ResourceHeatmapItem(
                weekIdx, "issue", x.i.Id, x.i.ProjectId, x.p.Name,
                x.i.Title, IsoDate(x.i.DueDate.Value)));
        }

        var ordered = rows
            .Select(kv => new ResourceHeatmapRow(
                kv.Key,
                kv.Value.counts,
                kv.Value.items
                    .OrderBy(it => it.DueDate, StringComparer.Ordinal)
                    .ThenBy(it => it.Kind, StringComparer.Ordinal)
                    .ThenBy(it => it.Id)
                    .ToList()))
            .OrderByDescending(r => r.Counts.Sum())
            .ThenBy(r => r.Assignee, StringComparer.CurrentCulture)
            .ToList();

        return new ResourceHeatmapDto(weekStarts, ordered, total, unassigned);
    }

    private static IEnumerable<string> SplitAssignees(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) yield break;
        foreach (var token in raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            yield return token;
        }
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

    // 주간 업무일지 통합에 붙일 '이슈 목록' — 전 프로젝트의 미해결(Open·InProgress) 이슈를 프로젝트별로 묶음.
    public async Task<IReadOnlyList<OpenIssuesByProjectDto>> GetOpenIssuesByProjectAsync()
    {
        var issues = await db.Issues
            .Where(i => i.Status == IssueStatus.Open || i.Status == IssueStatus.InProgress)
            .Include(i => i.AssigneeResource)
            .Include(i => i.Project)
            .ToListAsync();

        return issues
            .GroupBy(i => new { i.ProjectId, ProjectName = i.Project.Name })
            .Select(g => new OpenIssuesByProjectDto(
                g.Key.ProjectId,
                g.Key.ProjectName,
                g.OrderByDescending(i => i.Priority).ThenBy(i => i.Id)
                 .Select(i => new OpenIssueDto(i.Id, i.Title, i.Description, i.AssigneeResource?.Name))
                 .ToList()))
            .OrderBy(p => p.ProjectName)
            .ToList();
    }
}
