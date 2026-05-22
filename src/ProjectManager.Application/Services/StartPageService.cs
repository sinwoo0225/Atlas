using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

// E-2 시작 화면 위젯의 across-project 산출.
// - MyOpenItems: actor 매칭 (Issue.AssigneeResource.Name == actor || WBS.Assignee 콤마 토큰에 actor 포함) + 미완.
//   이슈는 미결 전부, WBS는 "오늘 처리할 일"(진행기간이 오늘 포함 또는 종료일이 오늘/지남)만. 우선순위·마감 정렬, cap 없음(전체보기 모달용).
// - DueSoonItems: 모든 미완 항목 중 마감이 now..now+7d. actor 무관. (Cap 적용)
public class StartPageService(IIssueRepository issueRepo, IWbsRepository wbsRepo)
{
    private const int Cap = 10;
    private static readonly TimeSpan DueSoonWindow = TimeSpan.FromDays(7);

    public async Task<StartPageDto> GetForActorAsync(string actor)
    {
        var now = DateTime.UtcNow;
        var cutoff = now.Add(DueSoonWindow);

        var openIssues = (await issueRepo.GetOpenAcrossProjectsAsync()).ToList();
        var openWbs = (await wbsRepo.GetOpenAcrossProjectsAsync()).ToList();

        var myOpenItems = new List<StartPageItemDto>();
        if (!string.IsNullOrEmpty(actor))
        {
            var myIssues = openIssues
                .Where(i => i.AssigneeResource != null
                         && string.Equals(i.AssigneeResource.Name, actor, StringComparison.Ordinal))
                .Select(IssueToItem);
            var myWbs = openWbs
                .Where(w => ContainsAssigneeToken(w.Assignee, actor) && WbsTodayRelevant(w))
                .Select(WbsToItem);
            myOpenItems = myIssues.Concat(myWbs)
                .OrderBy(it => PriorityRank(it.Priority))
                .ThenBy(it => it.DueDate ?? DateTime.MaxValue)
                .ToList();
        }

        var dueSoonIssues = openIssues
            .Where(i => i.DueDate.HasValue && i.DueDate.Value >= now && i.DueDate.Value <= cutoff)
            .Select(IssueToItem);
        var dueSoonWbs = openWbs
            .Where(w => w.EndDate.HasValue && w.EndDate.Value >= now && w.EndDate.Value <= cutoff)
            .Select(WbsToItem);
        var dueSoonItems = dueSoonIssues.Concat(dueSoonWbs)
            .OrderBy(it => it.DueDate ?? DateTime.MaxValue)
            .Take(Cap)
            .ToList();

        return new StartPageDto(myOpenItems, dueSoonItems);
    }

    private static StartPageItemDto IssueToItem(Issue i) => new(
        "issue", i.Id, i.ProjectId, i.Project?.Name ?? string.Empty,
        i.Title, i.Status.ToString(),
        i.Priority.ToString(), i.DueDate);

    private static StartPageItemDto WbsToItem(WbsItem w) => new(
        "wbs", w.Id, w.ProjectId, w.Project?.Name ?? string.Empty,
        w.Name, w.Status.ToString(),
        null, w.EndDate);

    // "오늘 처리할 일" WBS 판정: 종료일이 오늘/지남, 또는 진행기간이 오늘을 포함(날짜 미정은 진행 중으로 간주).
    // 로컬 앱이므로 DateTime.Today(로컬 자정) 기준, 비교는 날짜 단위.
    private static bool WbsTodayRelevant(WbsItem w)
    {
        var today = DateTime.Today;
        if (w.EndDate.HasValue && w.EndDate.Value.Date <= today) return true; // 마감 오늘/지남
        var started = !w.StartDate.HasValue || w.StartDate.Value.Date <= today;
        var notEnded = !w.EndDate.HasValue || w.EndDate.Value.Date >= today;
        return started && notEnded; // 진행기간이 오늘 포함
    }

    private static int PriorityRank(string? priority) => priority switch
    {
        "High" => 0,
        "Medium" => 1,
        "Low" => 2,
        _ => 3,
    };

    private static bool ContainsAssigneeToken(string assignee, string actor)
    {
        if (string.IsNullOrEmpty(assignee)) return false;
        var tokens = assignee.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        return tokens.Any(t => string.Equals(t, actor, StringComparison.Ordinal));
    }
}
