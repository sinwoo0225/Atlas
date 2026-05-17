using System.Text.Json.Nodes;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

public class MeetingService(
    IMeetingRepository repo,
    IProjectRepository projectRepo,
    MeetingMarkdownExporter exporter,
    IIssueRepository issueRepo,
    IWbsRepository wbsRepo)
{
    public async Task<IEnumerable<MeetingDto>> GetByProjectAsync(int projectId, string? keyword = null) =>
        (await repo.GetByProjectAsync(projectId, keyword)).Select(ToDto);

    public async Task<MeetingDto?> GetByIdAsync(int id)
    {
        var item = await repo.GetByIdAsync(id);
        return item is null ? null : ToDto(item);
    }

    public async Task<MeetingDto> CreateAsync(CreateMeetingDto dto)
    {
        var meeting = new Meeting
        {
            ProjectId = dto.ProjectId, Date = dto.Date,
            StartTime = dto.StartTime, EndTime = dto.EndTime,
            Attendees = dto.Attendees, Topic = dto.Topic,
            Decisions = dto.Decisions, Discussion = dto.Discussion,
            ActionItems = dto.ActionItems
        };
        var created = await repo.CreateAsync(meeting);
        // md export 는 Id 부여 후라야 frontmatter 가 의미 있다.
        await SyncMarkdownAsync(created, oldPath: null);
        return ToDto(created);
    }

    public async Task<MeetingDto?> UpdateAsync(int id, UpdateMeetingDto dto)
    {
        var meeting = await repo.GetByIdAsync(id);
        if (meeting is null) return null;
        var oldPath = meeting.MarkdownPath;
        var oldActionItems = meeting.ActionItems;
        meeting.Date = dto.Date;
        meeting.StartTime = dto.StartTime; meeting.EndTime = dto.EndTime;
        meeting.Attendees = dto.Attendees;
        meeting.Topic = dto.Topic; meeting.Decisions = dto.Decisions;
        meeting.Discussion = dto.Discussion; meeting.ActionItems = dto.ActionItems;
        var updated = await repo.UpdateAsync(meeting);
        await SyncMarkdownAsync(updated, oldPath);
        // C-1 양방향 sync (A 방향) — promoted ActionItem.content 변경 시 Issue.Title / WbsItem.Name 도 갱신.
        await SyncPromotedContentAsync(oldActionItems, updated.ActionItems);
        return ToDto(updated);
    }

    // 양쪽 모두 있는 ActionItem (id 매칭) 중, promotedXxxId 가 동일하게 유지되면서 content 가 바뀐 항목만 sync.
    // 값 같으면 repo 단의 가드(루프 방지)와 의존성 인터셉터가 자동 처리.
    private async Task SyncPromotedContentAsync(string oldRaw, string newRaw)
    {
        var oldMap = ParseActionItems(oldRaw);
        var newMap = ParseActionItems(newRaw);
        foreach (var (id, neu) in newMap)
        {
            if (!oldMap.TryGetValue(id, out var old)) continue;
            if (neu.Content == old.Content) continue;
            if (neu.PromotedIssueId is int issueId && issueId == old.PromotedIssueId)
            {
                var issue = await issueRepo.GetByIdAsync(issueId);
                if (issue is not null && issue.Title != neu.Content)
                {
                    issue.Title = neu.Content;
                    await issueRepo.UpdateAsync(issue);
                }
            }
            if (neu.PromotedWbsItemId is int wbsId && wbsId == old.PromotedWbsItemId)
            {
                var item = await wbsRepo.GetByIdAsync(wbsId);
                if (item is not null && item.Name != neu.Content)
                {
                    item.Name = neu.Content;
                    await wbsRepo.UpdateAsync(item);
                }
            }
        }
    }

    private record ActionItemLite(string Content, int? PromotedIssueId, int? PromotedWbsItemId);

    private static Dictionary<string, ActionItemLite> ParseActionItems(string raw)
    {
        var map = new Dictionary<string, ActionItemLite>();
        if (string.IsNullOrWhiteSpace(raw)) return map;
        JsonArray? arr;
        try { arr = JsonNode.Parse(raw) as JsonArray; }
        catch { return map; }
        if (arr is null) return map;
        foreach (var node in arr)
        {
            if (node is not JsonObject obj) continue;
            var id = obj["id"]?.GetValue<string>();
            if (string.IsNullOrEmpty(id)) continue;
            var content = obj["content"]?.GetValue<string>() ?? "";
            int? promotedIssue = obj["promotedIssueId"] is JsonValue iv && iv.TryGetValue<int>(out var i) ? i : null;
            int? promotedWbs = obj["promotedWbsItemId"] is JsonValue wv && wv.TryGetValue<int>(out var w) ? w : null;
            map[id] = new ActionItemLite(content, promotedIssue, promotedWbs);
        }
        return map;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var meeting = await repo.GetByIdAsync(id);
        if (meeting is null) return false;
        await exporter.DeleteAsync(meeting.MarkdownPath);
        await repo.DeleteAsync(id);
        return true;
    }

    // md 파일 갱신 + MarkdownPath 컬럼 동기화. 옛 경로와 새 경로가 다르면 옛 파일도 삭제.
    private async Task SyncMarkdownAsync(Meeting meeting, string? oldPath)
    {
        var project = await projectRepo.GetByIdAsync(meeting.ProjectId);
        if (project is null) return;

        var newPath = await exporter.SaveAsync(project, meeting);
        if (!string.IsNullOrEmpty(oldPath) && !string.Equals(oldPath, newPath, StringComparison.OrdinalIgnoreCase))
            await exporter.DeleteAsync(oldPath);

        if (newPath is not null && !string.Equals(meeting.MarkdownPath, newPath, StringComparison.OrdinalIgnoreCase))
        {
            meeting.MarkdownPath = newPath;
            await repo.UpdateAsync(meeting);
        }
    }

    private static MeetingDto ToDto(Meeting m) => new(
        m.Id, m.ProjectId, m.Date, m.StartTime, m.EndTime,
        m.Attendees, m.Topic,
        m.Decisions, m.Discussion, m.ActionItems,
        m.MarkdownPath,
        m.CreatedAt, m.UpdatedAt);
}
