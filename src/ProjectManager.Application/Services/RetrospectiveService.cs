using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.Application.Services;

// 프로젝트 회고 — 선택한 완료 프로젝트들을 비교 분석(순수 조회).
public class RetrospectiveService(AppDbContext db)
{
    public async Task<RetrospectiveDto> GetComparisonAsync(IReadOnlyList<int> projectIds)
    {
        var result = new List<ProjectRetrospectiveDto>();
        if (projectIds is null || projectIds.Count == 0) return new RetrospectiveDto(result);

        var ids = projectIds.Distinct().ToList();
        // 부모(자식 보유) WBS 는 그루핑 노드 — 모든 집계/번업에서 제외(leaf only).
        var parentSet = (await db.WbsItems.Where(w => w.ParentId != null)
            .Select(w => w.ParentId!.Value).Distinct().ToListAsync()).ToHashSet();

        var projects = (await db.Projects.Where(p => ids.Contains(p.Id)).ToListAsync())
            .ToDictionary(p => p.Id);

        foreach (var pid in ids)
        {
            if (!projects.TryGetValue(pid, out var p)) continue;

            var leafWbs = await db.WbsItems
                .Where(w => w.ProjectId == pid && !parentSet.Contains(w.Id) && !w.IsMilestone)
                .ToListAsync();
            var issues = await db.Issues.Where(i => i.ProjectId == pid).ToListAsync();

            var plannedStart = p.StartDate;
            var plannedEnd = p.EndDate;
            var actual = p.CompletedDate;

            // 프로젝트 일정 지연 — 계획종료 대비 실제완료.
            double? delayDays = null, delayRatio = null;
            if (plannedEnd is DateTime pe && actual is DateTime ac)
            {
                delayDays = (ac.Date - pe.Date).TotalDays;
                if (plannedStart is DateTime ps && (pe.Date - ps.Date).TotalDays > 0)
                    delayRatio = Math.Round(delayDays.Value / (pe.Date - ps.Date).TotalDays, 3);
            }

            // WBS 완료/지연 — 계획 종료일(EndDate)보다 늦게 완료된 비율.
            var wbsTotal = leafWbs.Count;
            var wbsDone = leafWbs.Count(w => w.Status == WbsStatus.Done);
            var late = leafWbs.Count(w => w.CompletedDate is DateTime cd && w.EndDate is DateTime ed && cd.Date > ed.Date);
            var lateRatio = wbsDone > 0 ? Math.Round((double)late / wbsDone, 3) : 0.0;

            // 착수 실적 — 계획시작 대비 실제착수 편차·정시 착수율, 사이클타임(실제착수→실제완료).
            var started = leafWbs.Where(w => w.ActualStartDate is DateTime).ToList();
            double? avgStartVar = null, onTimeStart = null, avgCycle = null;
            var startVarSample = started.Where(w => w.StartDate is DateTime).ToList();
            if (startVarSample.Count > 0)
            {
                avgStartVar = Math.Round(startVarSample.Average(w => (w.ActualStartDate!.Value.Date - w.StartDate!.Value.Date).TotalDays), 1);
                onTimeStart = Math.Round((double)startVarSample.Count(w => w.ActualStartDate!.Value.Date <= w.StartDate!.Value.Date) / startVarSample.Count, 3);
            }
            var cycleSample = started.Where(w => w.CompletedDate is DateTime).ToList();
            if (cycleSample.Count > 0)
                avgCycle = Math.Round(cycleSample.Average(w => (w.CompletedDate!.Value.Date - w.ActualStartDate!.Value.Date).TotalDays), 1);

            // 이슈 발생.
            var issuesTotal = issues.Count;
            var high = issues.Count(i => i.Priority == IssuePriority.High);
            var med = issues.Count(i => i.Priority == IssuePriority.Medium);
            var low = issues.Count(i => i.Priority == IssuePriority.Low);

            double? issueDensity = null;
            if (plannedStart is DateTime ps2 && plannedEnd is DateTime pe2)
            {
                var weeks = (pe2.Date - ps2.Date).TotalDays / 7.0;
                if (weeks > 0) issueDensity = Math.Round(issuesTotal / weeks, 2);
            }

            var resolved = issues.Where(i => i.ResolvedDate is DateTime).ToList();
            double? avgResolution = resolved.Count > 0
                ? Math.Round(resolved.Average(i => (i.ResolvedDate!.Value.Date - (i.OccurredOn ?? i.CreatedAt).Date).TotalDays), 1)
                : null;

            var burnUp = BuildBurnUp(leafWbs, plannedStart, plannedEnd, actual);

            result.Add(new ProjectRetrospectiveDto(
                p.Id, p.Name, p.Status,
                plannedStart, plannedEnd, actual,
                delayDays, delayRatio,
                wbsTotal, wbsDone, late, lateRatio,
                avgStartVar, onTimeStart, avgCycle, started.Count,
                issuesTotal, high, med, low,
                issueDensity, avgResolution, resolved.Count,
                burnUp));
        }

        return new RetrospectiveDto(result);
    }

    // 번업 S곡선 — x=계획기간 경과%(0~100), y=누적 완료%. 프로젝트별로 페이스(앞당김/뒤로 밀림)를 비교.
    private static IReadOnlyList<SCurvePointDto> BuildBurnUp(
        List<WbsItem> leaf, DateTime? start, DateTime? end, DateTime? actual)
    {
        var total = leaf.Count;
        var completed = leaf
            .Where(w => w.CompletedDate is DateTime)
            .OrderBy(w => w.CompletedDate!.Value)
            .ToList();
        if (total == 0 || completed.Count == 0) return Array.Empty<SCurvePointDto>();

        // 타임라인 앵커: 시작=계획시작 ?? 첫 완료, 종료=실제완료 ?? 계획종료 ?? 마지막 완료.
        var startAnchor = (start ?? completed[0].CompletedDate!.Value).Date;
        var endAnchor = (actual ?? end ?? completed[^1].CompletedDate!.Value).Date;
        var span = (endAnchor - startAnchor).TotalDays;

        var points = new List<SCurvePointDto> { new(0, 0) };
        var cum = 0;
        foreach (var w in completed)
        {
            cum++;
            var elapsed = span > 0
                ? Math.Clamp((w.CompletedDate!.Value.Date - startAnchor).TotalDays / span * 100.0, 0, 100)
                : 100.0;
            points.Add(new SCurvePointDto(Math.Round(elapsed, 1), Math.Round((double)cum / total * 100.0, 1)));
        }
        return points;
    }
}
