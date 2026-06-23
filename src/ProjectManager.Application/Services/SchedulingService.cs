using ProjectManager.Application.Scheduling;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

// 일정 지능 — 임계경로(CPM)·의존성 기반 자동 리스케줄(미리보기/적용). leaf 작업 + WbsDependency 만 대상.
// 부모(요약)는 자손 leaf 중 임계가 있으면 임계로 표시(하이라이트용). 날짜 부족 작업은 indeterminate 로 제외.
public class SchedulingService(IWbsRepository wbsRepo, IWbsDependencyRepository depRepo, WbsService wbsService)
{
    public async Task<CriticalPathDto> ComputeCriticalPathAsync(int projectId, int? versionId = null, bool skipWeekends = true)
    {
        var all = (await wbsRepo.GetByProjectAsync(projectId, versionId)).ToList();
        var parentIds = all.Where(x => x.ParentId != null).Select(x => x.ParentId!.Value).ToHashSet();
        var leaves = all.Where(x => !parentIds.Contains(x.Id)).ToList();
        var edges = (await depRepo.GetByProjectAsync(projectId, versionId)).ToList();

        // 두 날짜 모두 있는 leaf 만 CPM 참여. 나머지는 indeterminate.
        var dated = leaves.Where(x => x.StartDate.HasValue && x.EndDate.HasValue).ToList();
        if (dated.Count == 0)
            return new CriticalPathDto(null, null, false, [],
                leaves.Select(x => Indeterminate(x.Id)).ToList());

        var projectStart = dated.Min(x => x.StartDate!.Value.Date);

        int OffsetOf(DateTime d) => WorkdayCalendar.WorkingDaysInclusive(projectStart, d.Date) - 1;
        DateTime DateOf(int off) => WorkdayCalendar.Advance(projectStart, Math.Max(0, off), skipWeekends);
        int DurOf(WbsItem w) => w.IsMilestone ? 1 : Math.Max(1, WorkdayCalendar.WorkingDaysInclusive(w.StartDate!.Value.Date, w.EndDate!.Value.Date));

        var byId = dated.ToDictionary(x => x.Id);
        // 참여 leaf 사이의 엣지만(양 끝이 dated leaf).
        var liveEdges = edges.Where(e => byId.ContainsKey(e.PredecessorId) && byId.ContainsKey(e.SuccessorId)).ToList();
        var preds = liveEdges.GroupBy(e => e.SuccessorId).ToDictionary(g => g.Key, g => g.ToList());
        var succs = liveEdges.GroupBy(e => e.PredecessorId).ToDictionary(g => g.Key, g => g.ToList());

        // 위상 정렬(Kahn). 소비 못하면 사이클.
        var indeg = dated.ToDictionary(x => x.Id, x => preds.TryGetValue(x.Id, out var p) ? p.Count : 0);
        var queue = new Queue<int>(indeg.Where(kv => kv.Value == 0).Select(kv => kv.Key));
        var topo = new List<int>();
        while (queue.Count > 0)
        {
            var id = queue.Dequeue();
            topo.Add(id);
            if (succs.TryGetValue(id, out var outs))
                foreach (var e in outs)
                    if (--indeg[e.SuccessorId] == 0) queue.Enqueue(e.SuccessorId);
        }
        var hasCycle = topo.Count != dated.Count;
        if (hasCycle)
            return new CriticalPathDto(projectStart, null, true, [],
                leaves.Select(x => Indeterminate(x.Id)).ToList());

        // 전진(forward) — ES/EF. ES = max(계획 시작 오프셋, 선행 제약).
        var es = new Dictionary<int, int>();
        var ef = new Dictionary<int, int>();
        foreach (var id in topo)
        {
            var w = byId[id];
            var dur = DurOf(w);
            var start = OffsetOf(w.StartDate!.Value);
            if (preds.TryGetValue(id, out var ps))
                foreach (var e in ps)
                {
                    var p = byId[e.PredecessorId];
                    var required = e.Type switch
                    {
                        WbsDependencyType.FinishToStart => ef[e.PredecessorId] + 1 + e.LagDays,
                        WbsDependencyType.StartToStart => es[e.PredecessorId] + e.LagDays,
                        WbsDependencyType.FinishToFinish => ef[e.PredecessorId] + e.LagDays - dur + 1,
                        WbsDependencyType.StartToFinish => es[e.PredecessorId] + e.LagDays - dur + 1,
                        _ => start,
                    };
                    if (required > start) start = required;
                }
            es[id] = start;
            ef[id] = start + dur - 1;
        }

        var projectFinishOff = ef.Values.Max();

        // 후진(backward) — LF/LS.
        var lf = new Dictionary<int, int>();
        var ls = new Dictionary<int, int>();
        foreach (var id in Enumerable.Reverse(topo))
        {
            var w = byId[id];
            var dur = DurOf(w);
            var late = projectFinishOff;
            if (succs.TryGetValue(id, out var ss))
                foreach (var e in ss)
                {
                    var required = e.Type switch
                    {
                        WbsDependencyType.FinishToStart => ls[e.SuccessorId] - 1 - e.LagDays,
                        WbsDependencyType.StartToStart => ls[e.SuccessorId] - e.LagDays + dur - 1,
                        WbsDependencyType.FinishToFinish => lf[e.SuccessorId] - e.LagDays,
                        WbsDependencyType.StartToFinish => lf[e.SuccessorId] - e.LagDays, // 후행 종료 기준
                        _ => projectFinishOff,
                    };
                    if (required < late) late = required;
                }
            lf[id] = late;
            ls[id] = late - dur + 1;
        }

        var items = new List<CriticalPathItemDto>();
        var criticalLeafIds = new HashSet<int>();
        foreach (var w in dated)
        {
            var floatDays = ls[w.Id] - es[w.Id];
            var isCritical = floatDays <= 0;
            if (isCritical) criticalLeafIds.Add(w.Id);
            items.Add(new CriticalPathItemDto(
                w.Id, isCritical, floatDays,
                DateOf(es[w.Id]), DateOf(ef[w.Id]), DateOf(ls[w.Id]), DateOf(lf[w.Id]),
                false));
        }
        // 날짜 부족 leaf → indeterminate.
        foreach (var w in leaves.Where(x => !byId.ContainsKey(x.Id)))
            items.Add(Indeterminate(w.Id));
        // 부모 → 자손 leaf 중 임계 있으면 임계(하이라이트용, float 없음).
        foreach (var p in all.Where(x => parentIds.Contains(x.Id)))
        {
            var anyCritical = DescendantLeafIds(all, p.Id, parentIds).Any(criticalLeafIds.Contains);
            items.Add(new CriticalPathItemDto(p.Id, anyCritical, null, null, null, null, null, !anyCritical));
        }

        var criticalPath = topo.Where(criticalLeafIds.Contains).ToList();
        return new CriticalPathDto(projectStart, DateOf(projectFinishOff), false, criticalPath, items);
    }

    // 리스케줄 미리보기 — fromId 에서 후행만 위상순으로 push-only(늦추기만), duration 보존. 저장 안 함.
    public async Task<RescheduleResultDto> PreviewRescheduleAsync(int projectId, int fromWbsItemId, bool skipWeekends = true)
    {
        var all = (await wbsRepo.GetByProjectAsync(projectId, null)).ToList();
        var byId = all.ToDictionary(x => x.Id);
        var edges = (await depRepo.GetByProjectAsync(projectId)).ToList();
        var succs = edges.GroupBy(e => e.PredecessorId).ToDictionary(g => g.Key, g => g.ToList());
        var preds = edges.GroupBy(e => e.SuccessorId).ToDictionary(g => g.Key, g => g.ToList());

        // 현재(또는 이미 이동한) 날짜 추적.
        var curStart = all.ToDictionary(x => x.Id, x => x.StartDate);
        var curEnd = all.ToDictionary(x => x.Id, x => x.EndDate);
        var shifts = new List<RescheduleShiftDto>();

        // fromId 부터 도달 가능한 후행을 위상순으로 처리(visited 로 안전).
        var order = TopoFrom(fromWbsItemId, succs);
        foreach (var id in order)
        {
            if (id == fromWbsItemId) continue;
            if (!byId.TryGetValue(id, out var w)) continue;
            if (curStart[id] is not DateTime s0 || curEnd[id] is not DateTime e0) continue; // 날짜 없으면 이동 불가
            var durDays = (e0.Date - s0.Date).Days;

            DateTime? requiredStart = null;
            if (preds.TryGetValue(id, out var ps))
                foreach (var e in ps)
                {
                    if (curEnd[e.PredecessorId] is not DateTime pe || curStart[e.PredecessorId] is not DateTime psd) continue;
                    var req = e.Type switch
                    {
                        WbsDependencyType.FinishToStart => WorkdayCalendar.Advance(pe.Date, 1 + e.LagDays, skipWeekends),
                        WbsDependencyType.StartToStart => WorkdayCalendar.Advance(psd.Date, e.LagDays, skipWeekends),
                        WbsDependencyType.FinishToFinish => WorkdayCalendar.Advance(pe.Date, e.LagDays - durDays, skipWeekends),
                        WbsDependencyType.StartToFinish => WorkdayCalendar.Advance(psd.Date, e.LagDays - durDays, skipWeekends),
                        _ => s0.Date,
                    };
                    if (requiredStart is null || req > requiredStart) requiredStart = req;
                }

            if (requiredStart is DateTime rs && rs.Date > s0.Date) // push-only
            {
                var newStart = rs.Date;
                var newEnd = newStart.AddDays(durDays);
                curStart[id] = newStart;
                curEnd[id] = newEnd;
                shifts.Add(new RescheduleShiftDto(id, w.Name, s0, e0, newStart, newEnd, (newEnd - e0.Date).Days));
            }
        }

        return new RescheduleResultDto(fromWbsItemId, skipWeekends, shifts);
    }

    // 적용 — 각 이동을 WbsService.UpdateAsync 경유(동시성 토큰·완료 스탬프·동기화 보존).
    public async Task<RescheduleResultDto> ApplyRescheduleAsync(int projectId, IReadOnlyList<RescheduleShiftDto> shifts, bool skipWeekends = true)
    {
        foreach (var s in shifts)
        {
            var w = await wbsRepo.GetByIdAsync(s.WbsItemId);
            if (w is null || w.ProjectId != projectId) continue;
            var dto = new UpdateWbsItemDto(
                w.ParentId, w.Name, w.Assignee, s.NewStart, s.NewEnd,
                w.Status, w.IsMilestone, w.Importance, w.Notes, w.SortOrder,
                w.CompletedDate, w.UpdatedAt, w.EstimateHours);
            await wbsService.UpdateAsync(s.WbsItemId, dto);
        }
        return new RescheduleResultDto(0, skipWeekends, shifts);
    }

    private static CriticalPathItemDto Indeterminate(int id) =>
        new(id, false, null, null, null, null, null, true);

    private static IEnumerable<int> DescendantLeafIds(List<WbsItem> all, int rootId, HashSet<int> parentIds)
    {
        var children = all.Where(x => x.ParentId == rootId).ToList();
        foreach (var c in children)
        {
            if (parentIds.Contains(c.Id))
                foreach (var d in DescendantLeafIds(all, c.Id, parentIds)) yield return d;
            else yield return c.Id;
        }
    }

    // fromId 에서 후행(succ) 방향 BFS 후 부분 위상정렬 — 다이아몬드(여러 선행 합류) 대비 reachable 전체를 위상순으로.
    private static List<int> TopoFrom(int fromId, Dictionary<int, List<WbsDependency>> succs)
    {
        var reachable = new HashSet<int>();
        var stack = new Stack<int>();
        stack.Push(fromId);
        while (stack.Count > 0)
        {
            var cur = stack.Pop();
            if (!reachable.Add(cur)) continue;
            if (succs.TryGetValue(cur, out var outs))
                foreach (var e in outs) stack.Push(e.SuccessorId);
        }
        // reachable 부분그래프 위상정렬.
        var indeg = reachable.ToDictionary(x => x, _ => 0);
        foreach (var id in reachable)
            if (succs.TryGetValue(id, out var outs))
                foreach (var e in outs)
                    if (reachable.Contains(e.SuccessorId)) indeg[e.SuccessorId]++;
        var q = new Queue<int>(indeg.Where(kv => kv.Value == 0).Select(kv => kv.Key));
        var order = new List<int>();
        while (q.Count > 0)
        {
            var id = q.Dequeue();
            order.Add(id);
            if (succs.TryGetValue(id, out var outs))
                foreach (var e in outs)
                    if (reachable.Contains(e.SuccessorId) && --indeg[e.SuccessorId] == 0) q.Enqueue(e.SuccessorId);
        }
        return order;
    }
}
