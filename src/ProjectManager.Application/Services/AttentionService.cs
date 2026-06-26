using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.Application.Services;

// 주의 피드 — 기존 집계(마감/과배분/미배정/마일스톤/정체)를 합성한 계산형 알림. 룰엔진·영속·이메일 없음(로컬 우선).
// 단독 운영자(관리자)가 '지금 봐야 할 것'을 한눈에. MonitoringPage 개요 상단 카드 + nav 배지.
public class AttentionService(AppDbContext db, CapacityService capacity, MonitoringService monitoring)
{
    public async Task<AttentionFeedDto> GetAttentionAsync()
    {
        var today = DateTime.Now.Date;
        var soon = today.AddDays(3);
        var milestoneHorizon = today.AddDays(30);

        var parentIds = await db.WbsItems.Where(w => w.ParentId != null)
            .Select(w => w.ParentId!.Value).Distinct().ToListAsync();

        // leaf(요약 부모 제외) · 미완 WBS 기준.
        var leafOpen = db.WbsItems.Where(w => !parentIds.Contains(w.Id) && w.Status != WbsStatus.Done);
        var openIssues = db.Issues.Where(i => i.Status == IssueStatus.Open || i.Status == IssueStatus.InProgress);

        var overdue = await leafOpen.CountAsync(w => !w.IsMilestone && w.EndDate != null && w.EndDate.Value < today)
            + await openIssues.CountAsync(i => i.DueDate != null && i.DueDate.Value < today);

        var dueSoon = await leafOpen.CountAsync(w => !w.IsMilestone && w.EndDate != null && w.EndDate.Value >= today && w.EndDate.Value <= soon)
            + await openIssues.CountAsync(i => i.DueDate != null && i.DueDate.Value >= today && i.DueDate.Value <= soon);

        // 시작 지연 — 계획 시작일이 도래/지났는데 아직 Planned(미착수)인 leaf 작업.
        var lateStart = await leafOpen.CountAsync(w => !w.IsMilestone && w.Status == WbsStatus.Planned
            && w.StartDate != null && w.StartDate.Value <= today);

        var milestones = await leafOpen.CountAsync(w => w.IsMilestone && w.EndDate != null
            && w.EndDate.Value >= today && w.EndDate.Value <= milestoneHorizon);

        var unassigned = await leafOpen.CountAsync(w => w.Assignee == "")
            + await openIssues.CountAsync(i => i.AssigneeResourceId == null);

        // 이번 주 과배분 자원 수(시간 기반 용량).
        var capHeat = await capacity.GetHeatmapAsync(1);
        var overallocated = capHeat.Rows.Count(r => r.OverallocatedWeeks > 0);

        var stale = (await monitoring.GetStaleProjectsAsync(14)).Count;

        var items = new List<AttentionItemDto>();
        void Add(string kind, string sev, int count, string link)
        {
            if (count > 0) items.Add(new AttentionItemDto(kind, sev, count, link));
        }
        Add("overdue", "high", overdue, "/monitoring");
        Add("overallocated", "high", overallocated, "people");
        Add("lateStart", "medium", lateStart, "/monitoring");
        Add("dueSoon", "medium", dueSoon, "/monitoring");
        Add("unassigned", "medium", unassigned, "people");
        Add("milestone", "low", milestones, "/monitoring");
        Add("stale", "low", stale, "/monitoring");

        var order = new Dictionary<string, int> { ["high"] = 0, ["medium"] = 1, ["low"] = 2 };
        var sorted = items.OrderBy(i => order[i.Severity]).ThenByDescending(i => i.Count).ToList();
        return new AttentionFeedDto(sorted, sorted.Where(i => i.Severity == "high").Sum(i => i.Count));
    }
}
