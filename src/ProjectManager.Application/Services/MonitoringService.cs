using System.Text.Json;
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

    // 자식을 가진 부모 WBS 의 Id 목록 — 부모는 그루핑 역할이므로 모든 WBS 목록·집계에서 제외(leaf only).
    // EF 의 Contains 변환(IN/NOT IN)을 위해 List 로 반환.
    private async Task<List<int>> GetParentWbsIdsAsync() =>
        await db.WbsItems.Where(w => w.ParentId != null).Select(w => w.ParentId!.Value).Distinct().ToListAsync();

    public async Task<MonitoringDto> GetTodayAsync()
    {
        var today = DateTime.Now.Date;
        var tomorrow = today.AddDays(1);
        var parentWbsIds = await GetParentWbsIdsAsync();

        var items = await db.WbsItems
            .Where(w => !parentWbsIds.Contains(w.Id) && (w.Status == WbsStatus.InProgress
                || (w.StartDate.HasValue && w.EndDate.HasValue
                    && w.StartDate.Value.Date < tomorrow
                    && w.EndDate.Value.Date >= today
                    && w.Status != WbsStatus.Done)))
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

    // 마감 캘린더: [from, to] (날짜 단위, 양끝 포함) 의 WBS 종료일 + 이슈 마감일 이벤트를 across-project 로.
    // heatmap 과 같은 두 엔티티지만 전 상태 포함(status 캐리 → 프론트가 완료/지남 스타일 분기).
    public async Task<IReadOnlyList<CalendarEventDto>> GetCalendarAsync(DateTime from, DateTime to)
    {
        var fromDate = from.Date;
        var toDate = to.Date;
        var parentWbsIds = await GetParentWbsIdsAsync();

        var wbs = await db.WbsItems
            .Where(w => !parentWbsIds.Contains(w.Id)
                && w.EndDate.HasValue
                && w.EndDate.Value.Date >= fromDate
                && w.EndDate.Value.Date <= toDate)
            .Join(db.Projects, w => w.ProjectId, p => p.Id, (w, p) => new { w, p })
            .ToListAsync();

        var issues = await db.Issues
            .Where(i => i.DueDate.HasValue
                && i.DueDate.Value.Date >= fromDate
                && i.DueDate.Value.Date <= toDate)
            .Join(db.Projects, i => i.ProjectId, p => p.Id, (i, p) => new { i, p })
            .ToListAsync();

        var events = new List<CalendarEventDto>(wbs.Count + issues.Count);
        events.AddRange(wbs.Select(x => new CalendarEventDto(
            "wbs", x.w.Id, x.w.ProjectId, x.p.Name,
            x.w.Name, IsoDate(x.w.EndDate!.Value), x.w.Status.ToString(),
            x.w.IsMilestone, null)));
        events.AddRange(issues.Select(x => new CalendarEventDto(
            "issue", x.i.Id, x.i.ProjectId, x.p.Name,
            x.i.Title, IsoDate(x.i.DueDate!.Value), x.i.Status.ToString(),
            false, x.i.Priority.ToString())));

        return events;
    }

    // 칸반 보드: 미완(WBS 비-Done / 이슈 Open·InProgress) 전부 + 완료(Done / Resolved·Closed)는 doneSince 이후만.
    // 컬럼(예정/진행/완료) 그룹화는 프론트가 Status 매핑으로 수행(드래그 낙관 갱신).
    public async Task<IReadOnlyList<KanbanItemDto>> GetKanbanAsync(DateTime doneSince)
    {
        var parentWbsIds = await GetParentWbsIdsAsync();
        var wbs = await db.WbsItems
            .Where(w => !parentWbsIds.Contains(w.Id) && (w.Status != WbsStatus.Done || w.UpdatedAt >= doneSince))
            .Join(db.Projects, w => w.ProjectId, p => p.Id, (w, p) => new { w, p })
            .ToListAsync();

        var issues = await db.Issues
            .Where(i => i.Status == IssueStatus.Open || i.Status == IssueStatus.InProgress
                || ((i.Status == IssueStatus.Resolved || i.Status == IssueStatus.Closed) && i.UpdatedAt >= doneSince))
            .Include(i => i.AssigneeResource)
            .Join(db.Projects, i => i.ProjectId, p => p.Id, (i, p) => new { i, p })
            .ToListAsync();

        var items = new List<KanbanItemDto>(wbs.Count + issues.Count);
        items.AddRange(wbs.Select(x => new KanbanItemDto(
            "wbs", x.w.Id, x.w.ProjectId, x.p.Name, x.w.Name, x.w.Status.ToString(),
            x.w.IsMilestone, null,
            string.IsNullOrWhiteSpace(x.w.Assignee) ? null : x.w.Assignee,
            x.w.EndDate.HasValue ? IsoDate(x.w.EndDate.Value) : null)));
        items.AddRange(issues.Select(x => new KanbanItemDto(
            "issue", x.i.Id, x.i.ProjectId, x.p.Name, x.i.Title, x.i.Status.ToString(),
            false, x.i.Priority.ToString(),
            x.i.AssigneeResource != null ? x.i.AssigneeResource.Name : null,
            x.i.DueDate.HasValue ? IsoDate(x.i.DueDate.Value) : null)));
        return items;
    }

    public async Task<MonitoringChartsDto> GetChartsAsync(int upcomingDays = 30)
    {
        var today = DateTime.Today;
        var horizon = today.AddDays(upcomingDays);
        var parentWbsIds = await GetParentWbsIdsAsync();

        // 1) 프로젝트 상태 분포
        var statusRaw = await db.Projects
            .GroupBy(p => p.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync();
        int CountOf(ProjectStatus s) => statusRaw.FirstOrDefault(x => x.Status == s)?.Count ?? 0;
        // Planned 는 '대기/보류'(Waiting)로 통합 — 잔존 데이터가 있으면 Waiting 에 합산.
        var projectStatus = new ProjectStatusBreakdownDto(
            0,
            CountOf(ProjectStatus.Planned) + CountOf(ProjectStatus.Waiting),
            CountOf(ProjectStatus.InProgress),
            CountOf(ProjectStatus.Done),
            CountOf(ProjectStatus.Maintenance));

        // 2) 이슈 상태×우선순위 매트릭스 (전 상태 포함; Closed 도 시각화로 의미 있음)
        var issueMatrix = (await db.Issues
                .GroupBy(i => new { i.Status, i.Priority })
                .Select(g => new { g.Key.Status, g.Key.Priority, Count = g.Count() })
                .ToListAsync())
            .Select(x => new IssueMatrixCellDto(x.Status, x.Priority, x.Count))
            .ToList();

        // 3) 다가오는 마일스톤 (오늘부터 N일, 미완료, 종료일 오름차순)
        var milestones = await db.WbsItems
            .Where(w => !parentWbsIds.Contains(w.Id)
                && w.IsMilestone
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

        // 4) 프로젝트별 WBS 진행률 (마일스톤 제외, 부모 제외, 실제 leaf 작업만)
        var wbsRaw = await db.WbsItems
            .Where(w => !w.IsMilestone && !parentWbsIds.Contains(w.Id))
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
            // InProgress·Maintenance(활성) 먼저, 그 안에서 진행률 높은 순.
            .OrderBy(x => x.ProjectStatus == ProjectStatus.InProgress  ? 0
                : x.ProjectStatus == ProjectStatus.Maintenance ? 1
                : x.ProjectStatus == ProjectStatus.Done        ? 3 : 2)
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
                ProjectStatus.InProgress  => 0,
                ProjectStatus.Maintenance => 1,
                ProjectStatus.Waiting     => 2,
                ProjectStatus.Planned     => 2,
                _                          => 3,
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

    // === Phase 1: 개요 Risk Radar — 전 프로젝트의 마감 초과/임박 WBS + High Open 이슈 ===
    // ProjectService.GetDashboardAsync 의 RiskSignals 로직을 프로젝트 필터 없이 재현. 각 그룹 cap 20.
    public async Task<MonitoringRiskDto> GetRiskOverviewAsync()
    {
        const int cap = 20;
        var today = DateTime.Now.Date;
        var dueSoonCutoff = today.AddDays(7);
        var parentWbsIds = await GetParentWbsIdsAsync();

        var wbs = await db.WbsItems
            .Where(w => !parentWbsIds.Contains(w.Id) && w.EndDate.HasValue && w.Status != WbsStatus.Done
                && w.EndDate.Value.Date <= dueSoonCutoff)
            .Join(db.Projects, w => w.ProjectId, p => p.Id, (w, p) => new { w, p })
            .OrderBy(x => x.w.EndDate)
            .ToListAsync();

        var overdue = new List<RiskItemDto>();
        var dueSoon = new List<RiskItemDto>();
        foreach (var x in wbs)
        {
            var d = x.w.EndDate!.Value.Date;
            var item = new RiskItemDto("wbs", x.w.Id, x.w.ProjectId, x.p.Name, x.w.Name,
                string.IsNullOrWhiteSpace(x.w.Assignee) ? null : x.w.Assignee, IsoDate(d), null);
            if (d < today) { if (overdue.Count < cap) overdue.Add(item); }
            else if (dueSoon.Count < cap) dueSoon.Add(item);
        }

        var highOpen = (await db.Issues
                .Where(i => i.Priority == IssuePriority.High
                    && (i.Status == IssueStatus.Open || i.Status == IssueStatus.InProgress))
                .Include(i => i.AssigneeResource)
                .Join(db.Projects, i => i.ProjectId, p => p.Id, (i, p) => new { i, p })
                .OrderBy(x => x.i.DueDate ?? DateTime.MaxValue)
                .Take(cap)
                .ToListAsync())
            .Select(x => new RiskItemDto("issue", x.i.Id, x.i.ProjectId, x.p.Name, x.i.Title,
                x.i.AssigneeResource != null ? x.i.AssigneeResource.Name : null,
                x.i.DueDate.HasValue ? IsoDate(x.i.DueDate.Value) : null,
                x.i.Priority.ToString()))
            .ToList();

        return new MonitoringRiskDto(overdue, dueSoon, highOpen);
    }

    // === Phase 1: 방치된 프로젝트 — 활성인데 최근 활동이 days일 이상 없음 ===
    // 활동 기록이 전무한 프로젝트는 생성일(CreatedAt, UTC) 기준 경과로 판단.
    public async Task<IReadOnlyList<StaleProjectDto>> GetStaleProjectsAsync(int days)
    {
        var now = DateTime.UtcNow;

        var lastByProject = (await db.ActivityLogs
                .Where(a => a.ProjectId != null)
                .GroupBy(a => a.ProjectId!.Value)
                .Select(g => new { ProjectId = g.Key, Last = g.Max(a => a.Timestamp) })
                .ToListAsync())
            .ToDictionary(x => x.ProjectId, x => x.Last);

        var projects = await db.Projects
            .Where(p => p.Status == ProjectStatus.InProgress || p.Status == ProjectStatus.Waiting || p.Status == ProjectStatus.Maintenance)
            .Select(p => new { p.Id, p.Name, p.Status, p.CreatedAt })
            .ToListAsync();

        var result = new List<StaleProjectDto>();
        foreach (var p in projects)
        {
            DateTime? last = lastByProject.TryGetValue(p.Id, out var l) ? l : null;
            var baseline = last ?? p.CreatedAt;
            var daysSince = (int)Math.Floor((now - baseline).TotalDays);
            if (daysSince >= days)
                result.Add(new StaleProjectDto(p.Id, p.Name, p.Status,
                    last.HasValue ? IsoDate(last.Value) : null, daysSince));
        }
        return result.OrderByDescending(r => r.DaysSince).ToList();
    }

    // === Phase 1: 담당자별 워크로드 + 위험 (관리자 렌즈) + 미할당 큐 ===
    // 귀속은 엔티티 Assignee(WBS, 콤마 split) / AssigneeResource(Issue) — Actor 아님.
    // 담당자명은 대소문자 무시로 정규화(동일인 중복 방지), 표시명은 첫 등장.
    public async Task<WorkloadOverviewDto> GetWorkloadByAssigneeAsync()
    {
        var today = DateTime.Now.Date;
        var dueSoonCutoff = today.AddDays(7);
        var parentWbsIds = await GetParentWbsIdsAsync();

        var wbs = await db.WbsItems
            .Where(w => w.Status != WbsStatus.Done && !w.IsMilestone && !parentWbsIds.Contains(w.Id))
            .Join(db.Projects, w => w.ProjectId, p => p.Id, (w, p) => new { w, p })
            .ToListAsync();
        var issues = await db.Issues
            .Where(i => i.Status == IssueStatus.Open || i.Status == IssueStatus.InProgress)
            .Include(i => i.AssigneeResource)
            .Join(db.Projects, i => i.ProjectId, p => p.Id, (i, p) => new { i, p })
            .ToListAsync();

        var rows = new Dictionary<string, AssigneeAccum>(StringComparer.OrdinalIgnoreCase);
        AssigneeAccum Row(string name)
        {
            if (!rows.TryGetValue(name, out var r)) { r = new AssigneeAccum { DisplayName = name }; rows[name] = r; }
            return r;
        }
        var unassigned = new List<UnassignedItemDto>();

        foreach (var x in wbs)
        {
            var overdue = x.w.EndDate.HasValue && x.w.EndDate.Value.Date < today;
            var dueSoon = x.w.EndDate.HasValue && x.w.EndDate.Value.Date >= today && x.w.EndDate.Value.Date <= dueSoonCutoff;
            var assignees = SplitAssignees(x.w.Assignee).ToList();
            if (assignees.Count == 0)
            {
                unassigned.Add(new UnassignedItemDto("wbs", x.w.Id, x.w.ProjectId, x.p.Name, x.w.Name,
                    x.w.EndDate.HasValue ? IsoDate(x.w.EndDate.Value) : null));
                continue;
            }
            foreach (var name in assignees)
            {
                var r = Row(name);
                r.OpenWbs++;
                if (overdue) r.Overdue++; else if (dueSoon) r.DueSoon++;
            }
        }

        foreach (var x in issues)
        {
            var overdue = x.i.DueDate.HasValue && x.i.DueDate.Value.Date < today;
            var dueSoon = x.i.DueDate.HasValue && x.i.DueDate.Value.Date >= today && x.i.DueDate.Value.Date <= dueSoonCutoff;
            var high = x.i.Priority == IssuePriority.High;
            var name = x.i.AssigneeResource?.Name?.Trim();
            if (string.IsNullOrWhiteSpace(name))
            {
                unassigned.Add(new UnassignedItemDto("issue", x.i.Id, x.i.ProjectId, x.p.Name, x.i.Title,
                    x.i.DueDate.HasValue ? IsoDate(x.i.DueDate.Value) : null));
                continue;
            }
            var r = Row(name);
            r.OpenIssues++;
            if (overdue) r.Overdue++; else if (dueSoon) r.DueSoon++;
            if (high) r.HighOpen++;
        }

        var assigneesOut = rows.Values
            .Select(a => new AssigneeWorkloadDto(a.DisplayName, a.OpenWbs, a.OpenIssues, a.Overdue, a.DueSoon, a.HighOpen))
            .OrderByDescending(a => a.OpenWbs + a.OpenIssues)
            .ThenBy(a => a.Assignee, StringComparer.CurrentCulture)
            .ToList();

        var unassignedOut = unassigned
            .OrderBy(u => u.DueDate == null)
            .ThenBy(u => u.DueDate, StringComparer.Ordinal)
            .Take(20)
            .ToList();

        return new WorkloadOverviewDto(assigneesOut, unassignedOut);
    }

    private sealed class AssigneeAccum
    {
        public string DisplayName = string.Empty;
        public int OpenWbs, OpenIssues, Overdue, DueSoon, HighOpen;
    }

    // === Phase 1: Aging WIP — 진행중 항목의 나이(CreatedAt→오늘, UTC) 내림차순 cap 30 ===
    public async Task<IReadOnlyList<AgingWipItemDto>> GetAgingWipAsync()
    {
        var now = DateTime.UtcNow;
        var parentWbsIds = await GetParentWbsIdsAsync();

        var wbs = await db.WbsItems
            .Where(w => w.Status == WbsStatus.InProgress && !parentWbsIds.Contains(w.Id))
            .Join(db.Projects, w => w.ProjectId, p => p.Id, (w, p) => new { w, p })
            .ToListAsync();
        var issues = await db.Issues
            .Where(i => i.Status == IssueStatus.Open || i.Status == IssueStatus.InProgress)
            .Include(i => i.AssigneeResource)
            .Join(db.Projects, i => i.ProjectId, p => p.Id, (i, p) => new { i, p })
            .ToListAsync();

        var items = new List<AgingWipItemDto>(wbs.Count + issues.Count);
        items.AddRange(wbs.Select(x => new AgingWipItemDto(
            "wbs", x.w.Id, x.w.ProjectId, x.p.Name, x.w.Name,
            string.IsNullOrWhiteSpace(x.w.Assignee) ? null : x.w.Assignee,
            Math.Max(0, (int)(now - x.w.CreatedAt).TotalDays), IsoDate(x.w.CreatedAt))));
        items.AddRange(issues.Select(x => new AgingWipItemDto(
            "issue", x.i.Id, x.i.ProjectId, x.p.Name, x.i.Title,
            x.i.AssigneeResource != null ? x.i.AssigneeResource.Name : null,
            Math.Max(0, (int)(now - x.i.CreatedAt).TotalDays), IsoDate(x.i.CreatedAt))));

        return items.OrderByDescending(i => i.AgeDays).Take(30).ToList();
    }

    // === Phase 1: 카테고리별 프로젝트 분포 (개요 도넛) ===
    // Category 는 자유 문자열 — 공백/대소문자 정규화 후 합산, 빈 값은 "미분류".
    public async Task<IReadOnlyList<CategoryCountDto>> GetCategoryBreakdownAsync()
    {
        var raw = await db.Projects.Select(p => p.Category).ToListAsync();
        return raw
            .GroupBy(c => string.IsNullOrWhiteSpace(c) ? "미분류" : c.Trim(), StringComparer.CurrentCultureIgnoreCase)
            .Select(g => new CategoryCountDto(g.Key, g.Count()))
            .OrderByDescending(x => x.Count)
            .ThenBy(x => x.Category, StringComparer.CurrentCulture)
            .ToList();
    }

    // ===== Phase 2: 흐름·추세 (ActivityLog 상태전이 재구성) =====

    private static readonly JsonSerializerOptions ChangesJsonOptions = new() { PropertyNameCaseInsensitive = true };
    private static readonly HashSet<string> DoneStatusNames = new(StringComparer.OrdinalIgnoreCase) { "Done", "Resolved", "Closed" };

    // 현재 완료 상태(WBS Done / Issue Resolved·Closed)인 항목 + 완료 시점.
    // 완료 시점 = ActivityLog 의 Status→완료 전이 중 최신 Timestamp(UTC). 전이 기록 없으면 UpdatedAt 근사.
    // Assignee 귀속은 엔티티 필드(WBS 콤마 split / Issue AssigneeResource), Actor 아님.
    private sealed record CompletionEvent(
        string Kind, int Id, int ProjectId, string ProjectName, string Title,
        DateTime CreatedAt, DateTime CompletedAt, bool Approximate, IReadOnlyList<string> Assignees);

    private async Task<List<CompletionEvent>> GetCompletionEventsAsync()
    {
        // 1) 완료 전이 시각 맵: ChangesJson 의 "Status" New 값이 완료 상태인 Update 로그 중 (type,id)별 최신.
        var raw = await db.ActivityLogs
            .Where(a => a.Action == ActivityAction.Update
                && (a.EntityType == "WbsItem" || a.EntityType == "Issue")
                && a.ChangesJson != null && a.ChangesJson.Contains("Status"))
            .Select(a => new { a.EntityType, a.EntityId, a.Timestamp, a.ChangesJson })
            .ToListAsync();

        var transition = new Dictionary<(string, int), DateTime>();
        foreach (var r in raw)
        {
            try
            {
                var dict = JsonSerializer.Deserialize<Dictionary<string, ActivityChangeValue>>(r.ChangesJson!, ChangesJsonOptions);
                if (dict == null) continue;
                ActivityChangeValue? status = null;
                foreach (var kv in dict)
                    if (string.Equals(kv.Key, "Status", StringComparison.OrdinalIgnoreCase)) { status = kv.Value; break; }
                if (status is null || !DoneStatusNames.Contains(status.New)) continue;
                var key = (r.EntityType, r.EntityId);
                if (!transition.TryGetValue(key, out var existing) || r.Timestamp > existing)
                    transition[key] = r.Timestamp;
            }
            catch { /* malformed diff — skip */ }
        }

        var events = new List<CompletionEvent>();

        var parentWbsIds = await GetParentWbsIdsAsync();
        var wbs = await db.WbsItems
            .Where(w => w.Status == WbsStatus.Done && !parentWbsIds.Contains(w.Id))
            .Join(db.Projects, w => w.ProjectId, p => p.Id, (w, p) => new { w, p })
            .ToListAsync();
        foreach (var x in wbs)
        {
            var hasT = transition.TryGetValue(("WbsItem", x.w.Id), out var ts);
            events.Add(new CompletionEvent("wbs", x.w.Id, x.w.ProjectId, x.p.Name, x.w.Name,
                x.w.CreatedAt, hasT ? ts : x.w.UpdatedAt, !hasT, SplitAssignees(x.w.Assignee).ToList()));
        }

        var issues = await db.Issues
            .Where(i => i.Status == IssueStatus.Resolved || i.Status == IssueStatus.Closed)
            .Include(i => i.AssigneeResource)
            .Join(db.Projects, i => i.ProjectId, p => p.Id, (i, p) => new { i, p })
            .ToListAsync();
        foreach (var x in issues)
        {
            var hasT = transition.TryGetValue(("Issue", x.i.Id), out var ts);
            var assignees = string.IsNullOrWhiteSpace(x.i.AssigneeResource?.Name)
                ? (IReadOnlyList<string>)Array.Empty<string>()
                : new[] { x.i.AssigneeResource!.Name.Trim() };
            events.Add(new CompletionEvent("issue", x.i.Id, x.i.ProjectId, x.p.Name, x.i.Title,
                x.i.CreatedAt, hasT ? ts : x.i.UpdatedAt, !hasT, assignees));
        }

        return events;
    }

    private static double Percentile(IReadOnlyList<double> sortedAsc, double q)
        => sortedAsc.Count == 0 ? 0 : Math.Round(sortedAsc[(int)Math.Floor(q * (sortedAsc.Count - 1))], 1);

    // 추세 번들 — 완료 전이 추출 1회로 C-1~C-4 + B-3·B-4 모두 파생. weeks 주, activityDays 일.
    public async Task<MonitoringTrendsDto> GetTrendsAsync(int weeks = 12, int activityDays = 30)
    {
        var events = await GetCompletionEventsAsync();
        var week0 = WorkLogService.StartOfWeek(DateTime.Today).AddDays(-(weeks - 1) * 7);
        int WeekIdx(DateTime utc) => (int)((utc.ToLocalTime().Date - week0).TotalDays / 7);

        // C-1 주간 처리량
        var tp = new (int wbs, int issue)[weeks];
        foreach (var e in events)
        {
            var i = WeekIdx(e.CompletedAt);
            if (i < 0 || i >= weeks) continue;
            if (e.Kind == "wbs") tp[i].wbs++; else tp[i].issue++;
        }
        var throughput = Enumerable.Range(0, weeks)
            .Select(i => new ThroughputWeekDto(IsoDate(week0.AddDays(i * 7)), tp[i].wbs, tp[i].issue)).ToList();

        // C-2 이슈 순증감 (발생 = Issue.CreatedAt, 해결 = 완료 전이)
        var issueCreated = await db.Issues.Select(i => i.CreatedAt).ToListAsync();
        var opened = new int[weeks];
        foreach (var c in issueCreated) { var i = WeekIdx(c); if (i >= 0 && i < weeks) opened[i]++; }
        var resolved = new int[weeks];
        foreach (var e in events.Where(e => e.Kind == "issue")) { var i = WeekIdx(e.CompletedAt); if (i >= 0 && i < weeks) resolved[i]++; }
        var issueFlow = Enumerable.Range(0, weeks)
            .Select(i => new IssueFlowWeekDto(IsoDate(week0.AddDays(i * 7)), opened[i], resolved[i])).ToList();

        // C-3 사이클타임 + 백분위
        var points = events
            .Select(e => new CycleTimePointDto(e.Kind, e.Id, e.ProjectId, e.ProjectName, e.Title,
                Math.Max(0, Math.Round((e.CompletedAt - e.CreatedAt).TotalDays, 1)),
                IsoDate(e.CompletedAt.ToLocalTime()), e.Approximate))
            .OrderBy(p => p.CompletedAt, StringComparer.Ordinal).ToList();
        var daysSorted = points.Select(p => p.Days).OrderBy(d => d).ToList();
        var cycleTime = new CycleTimeDto(points,
            Percentile(daysSorted, 0.5), Percentile(daysSorted, 0.85), Percentile(daysSorted, 0.95),
            points.Count(p => p.Approximate));

        // C-4 활동량 추세 (일별, 로컬 날짜 버킷)
        var since = DateTime.UtcNow.AddDays(-(activityDays + 1));
        var stamps = await db.ActivityLogs.Where(a => a.Timestamp >= since).Select(a => a.Timestamp).ToListAsync();
        var dayCount = new Dictionary<DateTime, int>();
        foreach (var t in stamps) { var d = t.ToLocalTime().Date; dayCount[d] = dayCount.GetValueOrDefault(d) + 1; }
        var startDay = DateTime.Today.AddDays(-(activityDays - 1));
        var activityTrend = Enumerable.Range(0, activityDays)
            .Select(i => { var d = startDay.AddDays(i); return new ActivityTrendDayDto(IsoDate(d), dayCount.GetValueOrDefault(d)); })
            .ToList();

        // B-3 담당자별 주간 처리량
        var weekStarts = Enumerable.Range(0, weeks).Select(i => IsoDate(week0.AddDays(i * 7))).ToList();
        var atRows = new Dictionary<string, int[]>(StringComparer.OrdinalIgnoreCase);
        var atName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var e in events)
        {
            var wi = WeekIdx(e.CompletedAt);
            if (wi < 0 || wi >= weeks) continue;
            foreach (var name in e.Assignees)
            {
                if (!atRows.TryGetValue(name, out var arr)) { arr = new int[weeks]; atRows[name] = arr; atName[name] = name; }
                arr[wi]++;
            }
        }
        var assigneeThroughput = new AssigneeThroughputDto(weekStarts, atRows
            .Select(kv => new AssigneeThroughputRow(atName[kv.Key], kv.Value, kv.Value.Sum()))
            .OrderByDescending(r => r.Total).ThenBy(r => r.Assignee, StringComparer.CurrentCulture).ToList());

        // B-4 담당자별 사이클타임 (중앙값·85p)
        var ctByName = new Dictionary<string, List<double>>(StringComparer.OrdinalIgnoreCase);
        var ctName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var e in events)
        {
            var days = Math.Max(0, (e.CompletedAt - e.CreatedAt).TotalDays);
            foreach (var name in e.Assignees)
            {
                if (!ctByName.TryGetValue(name, out var list)) { list = new(); ctByName[name] = list; ctName[name] = name; }
                list.Add(days);
            }
        }
        var assigneeCycleTime = ctByName
            .Select(kv => { var s = kv.Value.OrderBy(x => x).ToList(); return new AssigneeCycleTimeDto(ctName[kv.Key], s.Count, Percentile(s, 0.5), Percentile(s, 0.85)); })
            .OrderByDescending(a => a.Count).ThenBy(a => a.Assignee, StringComparer.CurrentCulture).ToList();

        return new MonitoringTrendsDto(throughput, issueFlow, cycleTime, activityTrend, assigneeThroughput, assigneeCycleTime);
    }

    // ===== Phase 3: 예측·고급 (CFD · Monte Carlo · 간이 예상완료 · 부서 롤업) — 후순위·실험 =====
    public async Task<ForecastBundleDto> GetForecastAsync(int weeks = 12)
    {
        var today = DateTime.Today;
        var events = await GetCompletionEventsAsync();
        var parentWbsIds = await GetParentWbsIdsAsync();

        // --- D-1 CFD: 비-마일스톤 leaf WBS 의 일별 상태 누적 (전이로그 전방 재구성) ---
        var days = weeks * 7;
        var day0 = today.AddDays(-(days - 1));
        var wbsAll = await db.WbsItems
            .Where(w => !w.IsMilestone && !parentWbsIds.Contains(w.Id))
            .Select(w => new { w.Id, w.Status, w.CreatedAt })
            .ToListAsync();

        var logs = await db.ActivityLogs
            .Where(a => a.Action == ActivityAction.Update && a.EntityType == "WbsItem"
                && a.ChangesJson != null && a.ChangesJson.Contains("Status"))
            .Select(a => new { a.EntityId, a.Timestamp, a.ChangesJson })
            .ToListAsync();
        var transitions = new Dictionary<int, List<(DateTime Ts, WbsStatus New, WbsStatus Old)>>();
        foreach (var l in logs)
        {
            try
            {
                var dict = JsonSerializer.Deserialize<Dictionary<string, ActivityChangeValue>>(l.ChangesJson!, ChangesJsonOptions);
                if (dict is null) continue;
                ActivityChangeValue? st = null;
                foreach (var kv in dict) if (string.Equals(kv.Key, "Status", StringComparison.OrdinalIgnoreCase)) { st = kv.Value; break; }
                if (st is null) continue;
                if (!Enum.TryParse<WbsStatus>(st.New, out var newS) || !Enum.TryParse<WbsStatus>(st.Old, out var oldS)) continue;
                if (!transitions.TryGetValue(l.EntityId, out var list)) { list = new(); transitions[l.EntityId] = list; }
                list.Add((l.Timestamp, newS, oldS));
            }
            catch { /* malformed — skip */ }
        }
        foreach (var list in transitions.Values) list.Sort((a, b) => a.Ts.CompareTo(b.Ts));

        WbsStatus StateAt(int id, WbsStatus current, DateTime day)
        {
            if (!transitions.TryGetValue(id, out var list) || list.Count == 0) return current;
            WbsStatus? last = null;
            foreach (var t in list) if (t.Ts.ToLocalTime().Date <= day) last = t.New;
            return last ?? list[0].Old; // 첫 전이 이전 = 생성 당시 상태
        }

        var cfd = new List<CfdPointDto>(days);
        for (var i = 0; i < days; i++)
        {
            var d = day0.AddDays(i);
            int p = 0, ip = 0, dn = 0;
            foreach (var w in wbsAll)
            {
                if (w.CreatedAt.ToLocalTime().Date > d) continue;
                switch (StateAt(w.Id, w.Status, d))
                {
                    case WbsStatus.Planned: p++; break;
                    case WbsStatus.InProgress: ip++; break;
                    default: dn++; break;
                }
            }
            cfd.Add(new CfdPointDto(IsoDate(d), p, ip, dn));
        }

        // --- D-2 Monte Carlo: 전체 미완 WBS 백로그 소진 예측 (주간 WBS 처리량 리샘플링) ---
        var week0 = WorkLogService.StartOfWeek(today).AddDays(-(weeks - 1) * 7);
        var wkSample = new int[weeks];
        foreach (var e in events.Where(e => e.Kind == "wbs"))
        {
            var idx = (int)((e.CompletedAt.ToLocalTime().Date - week0).TotalDays / 7);
            if (idx >= 0 && idx < weeks) wkSample[idx]++;
        }
        var completedTotal = wkSample.Sum();
        var remaining = await db.WbsItems.CountAsync(w => !w.IsMilestone && w.Status != WbsStatus.Done && !parentWbsIds.Contains(w.Id));

        MonteCarloDto monteCarlo;
        if (completedTotal < 5 || remaining <= 0 || !wkSample.Any(s => s > 0))
        {
            monteCarlo = new MonteCarloDto(false, remaining, Array.Empty<MonteCarloBucketDto>(), 0, 0, null, null);
        }
        else
        {
            var rnd = new Random(12345); // 고정 시드 — 재로드 안정성
            const int trials = 1000;
            var results = new List<int>(trials);
            for (var t = 0; t < trials; t++)
            {
                int done = 0, w = 0;
                while (done < remaining && w < 200) { done += wkSample[rnd.Next(weeks)]; w++; }
                results.Add(w);
            }
            results.Sort();
            int Pw(double q) => results[(int)Math.Floor(q * (results.Count - 1))];
            var p50 = Pw(0.5);
            var p85 = Pw(0.85);
            var hist = results.GroupBy(x => x).OrderBy(g => g.Key)
                .Select(g => new MonteCarloBucketDto(g.Key, g.Count())).ToList();
            monteCarlo = new MonteCarloDto(true, remaining, hist, p50, p85,
                IsoDate(today.AddDays(p50 * 7)), IsoDate(today.AddDays(p85 * 7)));
        }

        // --- D-3 간이 예상완료 (프로젝트별 처리율 외삽) ---
        var activeProjects = await db.Projects
            .Where(p => p.Status == ProjectStatus.InProgress || p.Status == ProjectStatus.Waiting || p.Status == ProjectStatus.Maintenance)
            .Select(p => new { p.Id, p.Name, p.EndDate })
            .ToListAsync();
        var remainingByProject = (await db.WbsItems
            .Where(w => !w.IsMilestone && w.Status != WbsStatus.Done && !parentWbsIds.Contains(w.Id))
            .GroupBy(w => w.ProjectId)
            .Select(g => new { ProjectId = g.Key, Count = g.Count() })
            .ToListAsync())
            .ToDictionary(x => x.ProjectId, x => x.Count);
        var doneByProject = events
            .Where(e => e.Kind == "wbs" && e.CompletedAt.ToLocalTime().Date >= week0)
            .GroupBy(e => e.ProjectId)
            .ToDictionary(g => g.Key, g => g.Count());
        var projectForecasts = activeProjects
            .Select(p =>
            {
                var rem = remainingByProject.GetValueOrDefault(p.Id);
                var rate = (double)doneByProject.GetValueOrDefault(p.Id) / weeks;
                double? projected = rate > 0 ? Math.Round(rem / rate, 1) : null;
                double? toDeadline = p.EndDate.HasValue ? Math.Round((p.EndDate.Value.Date - today).TotalDays / 7.0, 1) : null;
                var atRisk = projected.HasValue && toDeadline.HasValue && projected.Value > toDeadline.Value;
                return new ProjectForecastDto(p.Id, p.Name, rem, projected, toDeadline, atRisk);
            })
            .Where(f => f.Remaining > 0)
            .OrderByDescending(f => f.AtRisk).ThenByDescending(f => f.Remaining)
            .ToList();

        // --- B-6 부서 롤업 (Resource.Department) ---
        var persons = await db.Resources
            .Where(r => r.Type == ResourceType.Person)
            .Select(r => new { r.Name, r.Department })
            .ToListAsync();
        var deptByName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var r in persons)
            if (!string.IsNullOrWhiteSpace(r.Name))
                deptByName[r.Name.Trim()] = string.IsNullOrWhiteSpace(r.Department) ? "기타" : r.Department.Trim();

        var departmentRollup = new List<DepartmentRollupDto>();
        if (persons.Any(r => !string.IsNullOrWhiteSpace(r.Department)))
        {
            var openWbsAssignees = await db.WbsItems
                .Where(w => !w.IsMilestone && w.Status != WbsStatus.Done && !parentWbsIds.Contains(w.Id))
                .Select(w => w.Assignee).ToListAsync();
            var openIssueNames = await db.Issues
                .Where(i => i.Status == IssueStatus.Open || i.Status == IssueStatus.InProgress)
                .Select(i => i.AssigneeResource != null ? i.AssigneeResource.Name : null).ToListAsync();

            var deptItems = new Dictionary<string, int>();
            var deptPeople = new Dictionary<string, HashSet<string>>();
            void AddItem(string? name)
            {
                if (string.IsNullOrWhiteSpace(name)) return;
                var key = name.Trim();
                var dept = deptByName.GetValueOrDefault(key, "기타");
                deptItems[dept] = deptItems.GetValueOrDefault(dept) + 1;
                if (!deptPeople.TryGetValue(dept, out var set)) { set = new(StringComparer.OrdinalIgnoreCase); deptPeople[dept] = set; }
                set.Add(key);
            }
            foreach (var a in openWbsAssignees) foreach (var name in SplitAssignees(a)) AddItem(name);
            foreach (var n in openIssueNames) AddItem(n);

            departmentRollup = deptItems
                .Select(kv => new DepartmentRollupDto(kv.Key, kv.Value, deptPeople[kv.Key].Count))
                .OrderByDescending(d => d.OpenItems)
                .ThenBy(d => d.Department, StringComparer.CurrentCulture)
                .ToList();
        }

        return new ForecastBundleDto(cfd, monteCarlo, projectForecasts, departmentRollup);
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
        var parentWbsIds = await GetParentWbsIdsAsync();

        var wbsItems = await db.WbsItems
            .Where(w => !parentWbsIds.Contains(w.Id)
                && w.EndDate.HasValue
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
        // 전체 Issue 엔티티 그래프(Project·AssigneeResource 네비게이션 + 변경추적)를 적재하는 대신
        // 필요한 스칼라만 SQL 로 투영하고 정렬도 DB 에 위임 — 데이터 多 시 메모리/추적 비용 제거.
        // 프로젝트별 묶음(중첩 컬렉션)은 EF 의 그룹 투영이 약해 C# 에서 그룹핑하되, 가벼운 행만 다룬다.
        var rows = await db.Issues
            .Where(i => i.Status == IssueStatus.Open || i.Status == IssueStatus.InProgress)
            .OrderBy(i => i.Project.Name)
            .ThenByDescending(i => i.Priority)
            .ThenBy(i => i.Id)
            .Select(i => new
            {
                i.ProjectId,
                ProjectName = i.Project.Name,
                i.Id,
                i.Title,
                i.Description,
                AssigneeName = i.AssigneeResource != null ? i.AssigneeResource.Name : null,
            })
            .ToListAsync();

        return rows
            .GroupBy(r => new { r.ProjectId, r.ProjectName })
            .Select(g => new OpenIssuesByProjectDto(
                g.Key.ProjectId,
                g.Key.ProjectName,
                g.Select(r => new OpenIssueDto(r.Id, r.Title, r.Description, r.AssigneeName)).ToList()))
            .OrderBy(p => p.ProjectName)
            .ToList();
    }

    // ===== 주간 회고 다이제스트 ('일지' 탭 상단) =====
    // 한 주[weekStart(월요일), +7일) 기준으로 3개 버킷을 조립:
    //   완료한 항목 = 완료 전이(또는 근사) 시각이 이번 주에 드는 것 (Phase 2 GetCompletionEventsAsync 재사용)
    //   놓친 마감   = 마감일이 이번 주에 속하고 오늘 기준 이미 지났으며 미완료
    //   다음 주 예정 = 마감일이 다음 주 범위이고 미완료
    public async Task<WeeklyReviewDto> GetWeeklyReviewAsync(DateTime weekStart)
    {
        var start = WorkLogService.StartOfWeek(weekStart);
        var weekEndExclusive = start.AddDays(7);
        var nextWeekEndExclusive = start.AddDays(14);
        var parentWbsIds = await GetParentWbsIdsAsync();

        var events = await GetCompletionEventsAsync();
        var completed = events
            .Where(e =>
            {
                var d = e.CompletedAt.ToLocalTime().Date;
                return d >= start && d < weekEndExclusive;
            })
            .OrderBy(e => e.CompletedAt)
            .Select(e => new ReviewCompletedItemDto(
                e.Kind, e.Id, e.ProjectId, e.ProjectName, e.Title,
                IsoDate(e.CompletedAt.ToLocalTime()), e.Approximate))
            .ToList();

        var missed = await GetDeadlineItemsAsync(start, weekEndExclusive, onlyPast: true, parentWbsIds);
        var upcoming = await GetDeadlineItemsAsync(weekEndExclusive, nextWeekEndExclusive, onlyPast: false, parentWbsIds);

        return new WeeklyReviewDto(IsoDate(start), completed, missed, upcoming);
    }

    // 마감일이 [fromInclusive, toExclusive) 인 미완료 WBS·이슈를 ReviewDeadlineItemDto 로.
    // onlyPast=true 면 마감일이 오늘 이전인 것만(놓친 마감). 마감일 오름차순 정렬.
    private async Task<List<ReviewDeadlineItemDto>> GetDeadlineItemsAsync(
        DateTime fromInclusive, DateTime toExclusive, bool onlyPast, List<int> parentWbsIds)
    {
        var today = DateTime.Now.Date;

        var wbs = await db.WbsItems
            .Where(w => !parentWbsIds.Contains(w.Id) && w.Status != WbsStatus.Done
                && w.EndDate.HasValue
                && w.EndDate.Value.Date >= fromInclusive && w.EndDate.Value.Date < toExclusive)
            .Join(db.Projects, w => w.ProjectId, p => p.Id, (w, p) => new { w, p })
            .ToListAsync();

        var issues = await db.Issues
            .Where(i => (i.Status == IssueStatus.Open || i.Status == IssueStatus.InProgress)
                && i.DueDate.HasValue
                && i.DueDate.Value.Date >= fromInclusive && i.DueDate.Value.Date < toExclusive)
            .Include(i => i.AssigneeResource)
            .Join(db.Projects, i => i.ProjectId, p => p.Id, (i, p) => new { i, p })
            .ToListAsync();

        var list = new List<ReviewDeadlineItemDto>(wbs.Count + issues.Count);
        foreach (var x in wbs)
        {
            var d = x.w.EndDate!.Value.Date;
            if (onlyPast && d >= today) continue;
            list.Add(new ReviewDeadlineItemDto("wbs", x.w.Id, x.w.ProjectId, x.p.Name, x.w.Name,
                string.IsNullOrWhiteSpace(x.w.Assignee) ? null : x.w.Assignee, IsoDate(d), null));
        }
        foreach (var x in issues)
        {
            var d = x.i.DueDate!.Value.Date;
            if (onlyPast && d >= today) continue;
            list.Add(new ReviewDeadlineItemDto("issue", x.i.Id, x.i.ProjectId, x.p.Name, x.i.Title,
                x.i.AssigneeResource != null ? x.i.AssigneeResource.Name : null, IsoDate(d),
                x.i.Priority.ToString()));
        }

        return list
            .OrderBy(i => i.DueDate, StringComparer.Ordinal)
            .ThenBy(i => i.Kind, StringComparer.Ordinal)
            .ThenBy(i => i.Id)
            .ToList();
    }
}
