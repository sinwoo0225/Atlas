using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

// ActionItem 의 식별자는 프론트가 부여한 string id (uuid). 인덱스 기반은
// reorder/삭제 race 위험이 있어 ActionItem JSON 에 id 를 두고 매칭한다.
public class ActionItemNotFoundException(string message) : Exception(message);
public class ActionItemAlreadyPromotedException(string message) : Exception(message);

public class ActionItemPromotionService(
    IMeetingRepository meetingRepo,
    IIssueRepository issueRepo,
    IWbsRepository wbsRepo,
    IResourceRepository resourceRepo,
    IActivityLogRepository activityLogRepo)
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = false,
    };

    public async Task<IssueDto> PromoteToIssueAsync(int meetingId, string actionItemId)
    {
        var meeting = await meetingRepo.GetByIdAsync(meetingId)
            ?? throw new ActionItemNotFoundException("회의록을 찾을 수 없습니다.");

        var (items, target) = FindActionItem(meeting.ActionItems, actionItemId);

        if (target["promotedIssueId"] is JsonValue v && v.TryGetValue<int>(out var existing))
            throw new ActionItemAlreadyPromotedException($"이미 Issue #{existing} 으로 승격됨");

        var assigneeId = await ResolveResourceIdAsync(target["assignee"]?.GetValue<string>() ?? "");
        var dueDate = ParseDeadline(target["deadline"]?.GetValue<string>() ?? "");
        var content = target["content"]?.GetValue<string>() ?? "";

        var issue = await issueRepo.CreateAsync(new Issue
        {
            ProjectId = meeting.ProjectId,
            Title = content,
            Description = "",
            Status = IssueStatus.Open,
            Priority = IssuePriority.Medium,
            AssigneeResourceId = assigneeId,
            DueDate = dueDate,
        });

        target["promotedIssueId"] = issue.Id;
        meeting.ActionItems = items.ToJsonString(JsonOpts);
        await meetingRepo.UpdateAsync(meeting);

        // 자동 캡처된 Issue Create 행을 Promote 로 재기록 — 활동 피드에서 자연 생성과 구분.
        // 실패는 silent (commit 은 이미 성공, 인터셉터 정책 일관).
        try { await activityLogRepo.RewriteLatestActionAsync("Issue", issue.Id, ActivityAction.Create, ActivityAction.Promote); }
        catch { /* swallow */ }

        var full = await issueRepo.GetByIdAsync(issue.Id) ?? issue;
        return new IssueDto(
            full.Id, full.ProjectId, full.Title, full.Description,
            full.Status, full.Priority,
            full.AssigneeResourceId, full.AssigneeResource?.Name,
            full.DueDate, full.OccurredOn, full.CreatedAt, full.UpdatedAt, full.ResolvedDate,
            full.Category, full.CustomFieldsJson, full.IsFavorite, full.SequenceNumber);
    }

    public async Task<WbsItemDto> PromoteToWbsAsync(int meetingId, string actionItemId)
    {
        var meeting = await meetingRepo.GetByIdAsync(meetingId)
            ?? throw new ActionItemNotFoundException("회의록을 찾을 수 없습니다.");

        var (items, target) = FindActionItem(meeting.ActionItems, actionItemId);

        if (target["promotedWbsItemId"] is JsonValue v && v.TryGetValue<int>(out var existing))
            throw new ActionItemAlreadyPromotedException($"이미 WBS #{existing} 으로 승격됨");

        var assignee = target["assignee"]?.GetValue<string>() ?? "";
        var endDate = ParseDeadline(target["deadline"]?.GetValue<string>() ?? "");
        var content = target["content"]?.GetValue<string>() ?? "";

        var currentVersion = (await wbsRepo.GetVersionsByProjectAsync(meeting.ProjectId))
            .FirstOrDefault(x => x.IsCurrent);

        // 사이클 14 — promotion path 가 WbsService.CreateAsync 우회 (versionId/parentId 차이) — SortOrder 인라인 계산.
        // 같은 부모(null=root) 형제 중 같은 startDate(null) 그룹 max+1, 없으면 전체 max+1.
        var rootSiblings = (await wbsRepo.GetByProjectAsync(meeting.ProjectId, null))
            .Where(x => x.ParentId == null).ToList();
        var sameDate = rootSiblings.Where(x => x.StartDate == null).ToList();
        var nextSortOrder = sameDate.Count > 0
            ? sameDate.Max(x => x.SortOrder) + 1
            : (rootSiblings.Count > 0 ? rootSiblings.Max(x => x.SortOrder) + 1 : 0);

        var item = await wbsRepo.CreateAsync(new WbsItem
        {
            ProjectId = meeting.ProjectId,
            VersionId = currentVersion?.Id,
            ParentId = null,
            Name = content,
            Assignee = assignee,
            StartDate = null,
            EndDate = endDate,
            Status = WbsStatus.Planned,
            // 회의록 액션아이템 승격은 항상 root 리프 — 실제 할 일이므로 Task(집계 대상). 명시해 둔다.
            Kind = WbsKind.Task,
            IsMilestone = false,
            Importance = 2,
            Notes = "",
            SortOrder = nextSortOrder,
        });

        target["promotedWbsItemId"] = item.Id;
        meeting.ActionItems = items.ToJsonString(JsonOpts);
        await meetingRepo.UpdateAsync(meeting);

        try { await activityLogRepo.RewriteLatestActionAsync("WbsItem", item.Id, ActivityAction.Create, ActivityAction.Promote); }
        catch { /* swallow */ }

        return new WbsItemDto(
            item.Id, item.ProjectId, item.VersionId, item.ParentId,
            item.Name, item.Assignee, item.StartDate, item.EndDate,
            item.Status, item.Kind, item.IsMilestone, item.Importance, item.Notes,
            item.CreatedAt, item.UpdatedAt, item.SortOrder,
            item.ActualStartDate, item.CompletedDate,
            item.EstimateHours, item.EstimateHours,
            item.BaselineStart, item.BaselineEnd,
            item.Subtasks?.Count ?? 0, item.Subtasks?.Count(s => s.IsDone) ?? 0, null,
            null);
    }

    private static (JsonArray Items, JsonObject Target) FindActionItem(string raw, string actionItemId)
    {
        JsonArray items;
        try
        {
            items = (JsonNode.Parse(raw) as JsonArray)
                ?? throw new ActionItemNotFoundException("ActionItem 목록이 비어 있습니다.");
        }
        catch (JsonException)
        {
            throw new ActionItemNotFoundException("ActionItem JSON 파싱 실패.");
        }

        foreach (var node in items)
        {
            if (node is JsonObject obj
                && obj["id"] is JsonValue idVal
                && idVal.TryGetValue<string>(out var id)
                && id == actionItemId)
            {
                return (items, obj);
            }
        }
        throw new ActionItemNotFoundException("ActionItem 을 찾을 수 없습니다.");
    }

    private async Task<int?> ResolveResourceIdAsync(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;
        var trimmed = name.Trim();
        var all = await resourceRepo.GetAllAsync();
        return all
            .FirstOrDefault(r => string.Equals(r.Name, trimmed, StringComparison.OrdinalIgnoreCase))?
            .Id;
    }

    // ActionItem.deadline 은 프론트의 <input type="date"> 값이라 보통 "YYYY-MM-DD".
    // 비어 있거나 파싱 실패 시 null 로 안전 fallback.
    private static DateTime? ParseDeadline(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        if (DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var dt))
            return dt;
        if (DateTime.TryParse(raw, out var dt2))
            return dt2;
        return null;
    }
}
