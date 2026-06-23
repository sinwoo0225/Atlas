using System.ComponentModel;
using ModelContextProtocol.Server;
using ProjectManager.Application.Output;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Mcp.Tools;

[McpServerToolType]
public static class MeetingTools
{
    // ActionItems 는 DB JSON-in-TEXT(string). 응답에서는 객체 배열로 풀어 LLM 이 한 번에 이해.
    private static object Project(MeetingDto m) => new
    {
        m.Id, m.ProjectId, m.Date, m.StartTime, m.EndTime, m.Category, m.Attendees, m.Topic,
        m.Decisions, m.Discussion,
        ActionItems = McpJson.TryParseJson(m.ActionItems),
        m.MarkdownPath, m.CreatedAt, m.UpdatedAt,
    };

    [McpServerTool(Name = "atlas_meeting_promote_action"),
     Description("회의록 ActionItem 을 Issue/WBS 로 승격 — 담당자 이름 매칭·마감일 파싱. target=Issue|Wbs. 이미 승격됐으면 에러. (UI 전용이던 승격을 에이전트에 노출)")]
    public static async Task<string> PromoteAction(
        ActionItemPromotionService svc,
        [Description("회의록 ID")] int meetingId,
        [Description("ActionItem id(uuid)")] string actionItemId,
        [Description("Issue | Wbs")] string target)
    {
        var t = (target ?? string.Empty).Trim().ToLowerInvariant();
        if (t == "issue") return McpJson.Serialize(await svc.PromoteToIssueAsync(meetingId, actionItemId));
        if (t == "wbs") return McpJson.Serialize(await svc.PromoteToWbsAsync(meetingId, actionItemId));
        throw new InvalidOperationException("target 은 Issue 또는 Wbs 여야 합니다.");
    }

    [McpServerTool(Name = "atlas_meeting_list"),
     Description("프로젝트 회의록 조회 (필터 + 출력 셰이핑). keyword 제목/내용 검색, category 내부/외부, from/to 회의일 범위.")]
    public static async Task<string> List(
        MeetingService svc,
        [Description("프로젝트 ID")] int projectId,
        [Description("키워드 — 없으면 전체")] string? keyword = null,
        [Description("구분 필터: Internal | External — 없으면 전부")] MeetingCategory? category = null,
        [Description("회의일 >= YYYY-MM-DD")] DateTime? from = null,
        [Description("회의일 <= YYYY-MM-DD (해당일 포함)")] DateTime? to = null,
        [Description("개수만 반환")] bool count = false,
        [Description("최대 N 건")] int? limit = null,
        [Description("축약 필드만")] bool brief = false,
        [Description("쉼표구분 필드만 (예: id,date,topic)")] string? fields = null)
    {
        var filter = new MeetingListFilter(Category: category, From: from, To: to, Keyword: keyword);
        var list = await svc.GetByProjectAsync(projectId, filter);
        return McpJson.SerializeList(list.Select(Project), McpJson.View(count, limit, brief, fields, BriefPresets.Meeting));
    }

    [McpServerTool(Name = "atlas_meeting_get"), Description("단일 회의록 상세 조회")]
    public static async Task<string> Get(MeetingService svc, int id)
    {
        var dto = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"Meeting {id} 없음");
        return McpJson.Serialize(Project(dto));
    }

    [McpServerTool(Name = "atlas_meeting_create"),
     Description("회의록 생성. actionItemsJson 은 JSON 배열 문자열: [{\"id\":\"a1\",\"content\":\"...\",\"assignee\":\"...\",\"deadline\":\"YYYY-MM-DD\"}]")]
    public static async Task<string> Create(
        MeetingService svc,
        [Description("프로젝트 ID")] int projectId,
        [Description("회의 날짜 YYYY-MM-DD")] DateTime date,
        [Description("주제")] string topic,
        [Description("시작 시각 HH:mm")] string? startTime = null,
        [Description("종료 시각 HH:mm")] string? endTime = null,
        [Description("회의 구분: Internal(기본) | External")] MeetingCategory category = MeetingCategory.Internal,
        [Description("참석자 (자유 형식: 'a, b, c')")] string? attendees = null,
        [Description("결정 사항 (markdown)")] string? decisions = null,
        [Description("논의 내용 (markdown)")] string? discussion = null,
        [Description("ActionItem JSON 배열 문자열 — 각 객체에 id/content 필수, assignee/deadline 선택")]
        string? actionItemsJson = null)
    {
        var dto = new CreateMeetingDto(
            ProjectId: projectId,
            Date: date,
            StartTime: startTime,
            EndTime: endTime,
            Category: category,
            Attendees: attendees ?? string.Empty,
            Topic: topic,
            Decisions: decisions ?? string.Empty,
            Discussion: discussion ?? string.Empty,
            ActionItems: string.IsNullOrWhiteSpace(actionItemsJson) ? "[]" : actionItemsJson);
        return McpJson.Serialize(Project(await svc.CreateAsync(dto)));
    }

    [McpServerTool(Name = "atlas_meeting_update"),
     Description("회의록 부분 갱신 — null 인 필드는 기존 값 유지. actionItemsJson 은 전체 교체")]
    public static async Task<string> Update(
        MeetingService svc, int id,
        DateTime? date = null,
        string? startTime = null, string? endTime = null,
        [Description("회의 구분: Internal | External — null 이면 기존 값 유지")] MeetingCategory? category = null,
        string? attendees = null, string? topic = null,
        string? decisions = null, string? discussion = null,
        [Description("ActionItem JSON 배열 — 전달 시 전체 교체")] string? actionItemsJson = null)
    {
        var existing = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"Meeting {id} 없음");
        var dto = new UpdateMeetingDto(
            Date: date ?? existing.Date,
            StartTime: startTime ?? existing.StartTime,
            EndTime: endTime ?? existing.EndTime,
            Category: category ?? existing.Category,
            Attendees: attendees ?? existing.Attendees,
            Topic: topic ?? existing.Topic,
            Decisions: decisions ?? existing.Decisions,
            Discussion: discussion ?? existing.Discussion,
            ActionItems: actionItemsJson ?? existing.ActionItems,
            UpdatedAt: existing.UpdatedAt);
        var updated = await svc.UpdateAsync(id, dto)
            ?? throw new InvalidOperationException($"Meeting {id} 없음");
        return McpJson.Serialize(Project(updated));
    }

    [McpServerTool(Name = "atlas_meeting_delete"),
     Description("회의록 삭제 (export 된 md 파일도 같이 제거)")]
    public static async Task<string> Delete(MeetingService svc, int id)
    {
        if (!await svc.DeleteAsync(id))
            throw new InvalidOperationException($"Meeting {id} 없음");
        return McpJson.Serialize(new { deleted = true, id });
    }
}
