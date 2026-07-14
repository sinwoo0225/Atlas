using Microsoft.EntityFrameworkCore;
using ProjectManager.Application.Scheduling;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.Application.Services;

// 자원 용량 계획 — 주별 수요(배정 작업 공수 영업일 분배) vs 용량(주당 가용 − 휴가) → 가동률·과배분.
// 단독 운영자(관리자)가 팀원(자원)들의 부하를 보는 용도. 건수 기반 ResourceHeatmap 의 시간 기반 상위호환.
public class CapacityService(AppDbContext db)
{
    private const double Epsilon = 0.0001;

    private static string IsoDate(DateTime d) => d.ToString("yyyy-MM-dd");

    // 전 자원 × 주 용량 히트맵. weeks 주(기본 8), 이번 주 월요일부터.
    public async Task<CapacityHeatmapDto> GetHeatmapAsync(int weeks = 8)
    {
        weeks = Math.Clamp(weeks, 1, 52);
        var weekStart0 = WorkLogService.StartOfWeek(DateTime.Today);
        var horizonEnd = weekStart0.AddDays(weeks * 7 - 1);
        var weekStarts = Enumerable.Range(0, weeks).Select(i => IsoDate(weekStart0.AddDays(i * 7))).ToList();

        // 집계 대상(그룹 제외) · 미완 · 배정 있는 작업만. 그룹은 그루핑 노드라 수요를 만들지 않는다.
        var items = await db.WbsItems
            .OnlyTasks().OnlyOpen()
            .Where(w => w.Assignments.Any())
            .Include(w => w.Assignments).ThenInclude(a => a.Resource)
            .ToListAsync();

        var avails = (await db.ResourceAvailabilities
            .Where(a => a.StartDate <= horizonEnd && a.EndDate >= weekStart0)
            .ToListAsync())
            .ToLookup(a => a.ResourceId);

        // 자원별 주 수요 누적.
        var demand = new Dictionary<int, double[]>();
        double unscheduled = 0;
        var unestimated = 0;

        foreach (var w in items)
        {
            var hasEstimate = w.EstimateHours is > 0;
            var start = (w.StartDate ?? w.EndDate)?.Date;
            var end = (w.EndDate ?? w.StartDate)?.Date;

            foreach (var a in w.Assignments)
            {
                if (a.Resource is null || !a.Resource.IsActive) continue;
                if (!hasEstimate) { continue; }
                var resourceEffort = w.EstimateHours!.Value * a.AllocationPercent / 100.0;
                if (start is null || end is null)
                {
                    unscheduled += resourceEffort; // 추정은 있으나 일정 없음 — 주 배치 불가.
                    continue;
                }
                var dist = Distribute(start.Value, end.Value, resourceEffort, weekStart0, weeks);
                if (!demand.TryGetValue(a.ResourceId, out var arr)) { arr = new double[weeks]; demand[a.ResourceId] = arr; }
                for (var i = 0; i < weeks; i++) arr[i] += dist[i];
            }

            // 배정됐으나 미추정 — 작업 단위 1회 카운트(활성 배정이 하나라도 있을 때).
            if (!hasEstimate && w.Assignments.Any(a => a.Resource?.IsActive == true))
                unestimated++;
        }

        // 행 = 배정에 등장한 활성 자원(이번 윈도우에 부하 0이어도 노출 → 유휴 가시화).
        var workingResources = items
            .SelectMany(w => w.Assignments)
            .Where(a => a.Resource is { IsActive: true })
            .Select(a => a.Resource!)
            .GroupBy(r => r.Id).Select(g => g.First())
            .ToList();

        var rows = workingResources
            .Select(r => BuildRow(r, demand.GetValueOrDefault(r.Id), avails[r.Id].ToList(), weekStarts, weeks))
            .OrderByDescending(r => r.TotalDemandHours)
            .ThenBy(r => r.Name, StringComparer.CurrentCulture)
            .ToList();

        return new CapacityHeatmapDto(weekStarts, rows, Math.Round(unscheduled, 2), unestimated);
    }

    // 단일 자원 용량 행.
    public async Task<ResourceCapacityRowDto?> GetResourceCapacityAsync(int resourceId, int weeks = 8)
    {
        weeks = Math.Clamp(weeks, 1, 52);
        var resource = await db.Resources.FindAsync(resourceId);
        if (resource is null) return null;
        var weekStart0 = WorkLogService.StartOfWeek(DateTime.Today);
        var horizonEnd = weekStart0.AddDays(weeks * 7 - 1);
        var weekStarts = Enumerable.Range(0, weeks).Select(i => IsoDate(weekStart0.AddDays(i * 7))).ToList();

        var items = await db.WbsItems
            .OnlyTasks().OnlyOpen()
            .Where(w => w.Assignments.Any(a => a.ResourceId == resourceId))
            .Include(w => w.Assignments.Where(a => a.ResourceId == resourceId))
            .ToListAsync();

        var arr = new double[weeks];
        foreach (var w in items)
        {
            if (w.EstimateHours is not > 0) continue;
            var start = (w.StartDate ?? w.EndDate)?.Date;
            var end = (w.EndDate ?? w.StartDate)?.Date;
            if (start is null || end is null) continue;
            var alloc = w.Assignments.FirstOrDefault(a => a.ResourceId == resourceId)?.AllocationPercent ?? 100;
            var dist = Distribute(start.Value, end.Value, w.EstimateHours!.Value * alloc / 100.0, weekStart0, weeks);
            for (var i = 0; i < weeks; i++) arr[i] += dist[i];
        }

        var avails = await db.ResourceAvailabilities
            .Where(a => a.ResourceId == resourceId && a.StartDate <= horizonEnd && a.EndDate >= weekStart0)
            .ToListAsync();
        return BuildRow(resource, arr, avails, weekStarts, weeks);
    }

    private static ResourceCapacityRowDto BuildRow(
        Resource r, double[]? demand, List<ResourceAvailability> avails,
        IReadOnlyList<string> weekStarts, int weeks)
    {
        var weekStart0 = DateTime.Parse(weekStarts[0]);
        demand ??= new double[weeks];
        var cells = new List<CapacityCellDto>(weeks);
        double totalDemand = 0;
        double utilSum = 0;
        var overWeeks = 0;
        for (var i = 0; i < weeks; i++)
        {
            var ws = weekStart0.AddDays(i * 7);
            var cap = CapacityForWeek(r.WeeklyCapacityHours, ws, avails);
            var dem = Math.Round(demand[i], 2);
            var util = cap > Epsilon ? Math.Round(dem / cap * 100, 1) : (dem > Epsilon ? 999 : 0);
            var over = dem > cap + Epsilon;
            if (over) overWeeks++;
            totalDemand += dem;
            utilSum += util;
            cells.Add(new CapacityCellDto(weekStarts[i], dem, Math.Round(cap, 2), util, over));
        }
        return new ResourceCapacityRowDto(
            r.Id, r.Name, r.Department, r.Skills, r.WeeklyCapacityHours,
            cells, Math.Round(totalDemand, 2), Math.Round(utilSum / weeks, 1), overWeeks);
    }

    // 작업 공수를 [start,end] 영업일 비례로 주별 분배(윈도우 밖 영업일은 미집계 → 윈도우 내 비례분만).
    private static double[] Distribute(DateTime start, DateTime end, double hours, DateTime weekStart0, int weeks)
    {
        var arr = new double[weeks];
        var totalWd = WorkdayCalendar.WorkingDaysInclusive(start, end);
        if (totalWd <= 0)
        {
            // 주말만의 span — 시작 주에 전량 배치.
            var wi = (int)((start.Date - weekStart0).TotalDays / 7);
            if (wi >= 0 && wi < weeks) arr[wi] += hours;
            return arr;
        }
        for (var i = 0; i < weeks; i++)
        {
            var ws = weekStart0.AddDays(i * 7);
            var wd = WorkdayCalendar.WorkingDaysInWeek(start, end, ws);
            if (wd > 0) arr[i] += hours * wd / totalWd;
        }
        return arr;
    }

    // 주당 용량 = WeeklyCapacityHours − 그 주와 겹치는 휴가. Hours 지정 시 휴가 영업일 비례, 미지정 시 일=cap/5.
    private static double CapacityForWeek(double weeklyCap, DateTime weekStart, List<ResourceAvailability> avails)
    {
        double deduct = 0;
        foreach (var a in avails)
        {
            var wdInWeek = WorkdayCalendar.WorkingDaysInWeek(a.StartDate, a.EndDate, weekStart);
            if (wdInWeek == 0) continue;
            if (a.Hours.HasValue)
            {
                var totalWd = Math.Max(1, WorkdayCalendar.WorkingDaysInclusive(a.StartDate, a.EndDate));
                deduct += a.Hours.Value * wdInWeek / totalWd;
            }
            else deduct += wdInWeek * (weeklyCap / 5.0);
        }
        return Math.Max(0, weeklyCap - deduct);
    }

    // 교차 프로젝트 가동률 리포트(Phase 3) — 전 활성 자원 기간 합계.
    public async Task<UtilizationReportDto> GetUtilizationReportAsync(int weeks = 8, string? department = null)
    {
        var heatmap = await GetHeatmapAsync(weeks);
        var rows = heatmap.Rows
            .Where(r => department is null || string.Equals(r.Department, department, StringComparison.OrdinalIgnoreCase))
            .Select(r => new UtilizationReportRowDto(
                r.ResourceId, r.Name, r.Department, r.Skills, true,
                r.TotalDemandHours,
                Math.Round(r.Weeks.Sum(w => w.CapacityHours), 2),
                r.AvgUtilizationPercent, r.OverallocatedWeeks))
            .ToList();
        return new UtilizationReportDto(
            heatmap.WeekStarts.Count > 0 ? heatmap.WeekStarts[0] : "",
            heatmap.WeekStarts.Count > 0 ? heatmap.WeekStarts[^1] : "",
            weeks, rows);
    }
}
