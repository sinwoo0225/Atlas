using System.ComponentModel;
using ModelContextProtocol.Server;
using ProjectManager.Application.Output;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Mcp.Tools;

[McpServerToolType]
public static class IssueTools
{
    [McpServerTool(Name = "atlas_issue_list"),
     Description("프로젝트 이슈 조회 (DB-side 필터 + 출력 셰이핑). 미해결만 보려면 open=true. " +
                 "statuses 다중 가능. count=true 면 개수만, brief=true 면 축약 필드, fields 로 임의 투영.")]
    public static async Task<string> List(
        IssueService svc,
        [Description("프로젝트 ID")] int projectId,
        [Description("상태 다중 필터 (Open|InProgress|Resolved|Closed). 없으면 전체")] IssueStatus[]? statuses = null,
        [Description("미해결만 (Open|InProgress) — statuses 미지정 시 적용")] bool open = false,
        [Description("우선순위 다중 필터 (Low|Medium|High)")] IssuePriority[]? priorities = null,
        [Description("담당자 Resource ID 정확 일치")] int? assigneeResourceId = null,
        [Description("담당자 이름 부분일치 (정확 ID 는 assigneeResourceId)")] string? assigneeName = null,
        [Description("마감일 >= YYYY-MM-DD")] DateTime? dueFrom = null,
        [Description("마감일 <= YYYY-MM-DD (해당일 포함)")] DateTime? dueTo = null,
        [Description("발생일 >= YYYY-MM-DD")] DateTime? occurredFrom = null,
        [Description("발생일 <= YYYY-MM-DD (해당일 포함)")] DateTime? occurredTo = null,
        [Description("기한 초과 미완료만")] bool overdue = false,
        [Description("제목·설명 부분일치")] string? keyword = null,
        [Description("분류 정확 일치")] string? category = null,
        [Description("개수만 반환")] bool count = false,
        [Description("최대 N 건")] int? limit = null,
        [Description("축약 필드만")] bool brief = false,
        [Description("쉼표구분 필드만 (예: id,title,status)")] string? fields = null)
    {
        IReadOnlyList<IssueStatus>? statusFilter =
            statuses is { Length: > 0 } ? statuses : (open ? IssueListFilter.OpenStatuses : null);
        var filter = new IssueListFilter(
            Statuses: statusFilter,
            Priorities: priorities is { Length: > 0 } ? priorities : null,
            AssigneeResourceId: assigneeResourceId,
            AssigneeName: assigneeName,
            DueFrom: dueFrom, DueTo: dueTo,
            OccurredFrom: occurredFrom, OccurredTo: occurredTo,
            Overdue: overdue,
            Keyword: keyword,
            Category: category);
        var list = await svc.GetByProjectAsync(projectId, filter);
        return McpJson.SerializeList(list, McpJson.View(count, limit, brief, fields, BriefPresets.Issue));
    }

    [McpServerTool(Name = "atlas_issue_categories"),
     Description("프로젝트의 distinct 분류 목록 (분류 자동완성 후보). sort=freq 면 빈도순, 기본 alpha")]
    public static async Task<string> Categories(
        IssueService svc,
        [Description("프로젝트 ID")] int projectId,
        [Description("alpha(기본)|freq")] string? sort = null) =>
        McpJson.Serialize(await svc.GetDistinctCategoriesAsync(projectId, sort));

    [McpServerTool(Name = "atlas_issue_get"), Description("단일 이슈 상세 조회")]
    public static async Task<string> Get(IssueService svc, int id)
    {
        var dto = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"Issue {id} 없음");
        return McpJson.Serialize(dto);
    }

    [McpServerTool(Name = "atlas_issue_create"),
     Description("이슈 생성. status 기본 Open, priority 기본 Medium")]
    public static async Task<string> Create(
        IssueService svc,
        [Description("프로젝트 ID")] int projectId,
        [Description("제목")] string title,
        [Description("설명 (markdown)")] string? description = null,
        [Description("Open|InProgress|Resolved|Closed (기본 Open)")] IssueStatus? status = null,
        [Description("Low|Medium|High (기본 Medium)")] IssuePriority? priority = null,
        [Description("담당자 Resource ID")] int? assigneeResourceId = null,
        [Description("마감일 YYYY-MM-DD")] DateTime? dueDate = null,
        [Description("발생일자 YYYY-MM-DD (이슈가 실제 발생한 시점)")] DateTime? occurredOn = null,
        [Description("해결일(실적) YYYY-MM-DD — 생략 시 Resolved/Closed 면 오늘 자동")] DateTime? resolvedDate = null,
        [Description("분류 (자유 입력 단일값)")] string? category = null,
        [Description("커스텀 컬럼 값 맵 JSON (예: {\"env\":\"prod\"})")] string? customFieldsJson = null) =>
        McpJson.Serialize(await svc.CreateAsync(new CreateIssueDto(
            ProjectId: projectId,
            Title: title,
            Description: description ?? string.Empty,
            Status: status ?? IssueStatus.Open,
            Priority: priority ?? IssuePriority.Medium,
            AssigneeResourceId: assigneeResourceId,
            DueDate: dueDate,
            OccurredOn: occurredOn,
            ResolvedDate: resolvedDate,
            Category: category,
            CustomFieldsJson: customFieldsJson)));

    [McpServerTool(Name = "atlas_issue_update"),
     Description("이슈 부분 갱신 — null 인 필드는 기존 값 유지")]
    public static async Task<string> Update(
        IssueService svc, int id,
        string? title = null, string? description = null,
        IssueStatus? status = null, IssuePriority? priority = null,
        int? assigneeResourceId = null, DateTime? dueDate = null,
        DateTime? occurredOn = null,
        [Description("해결일(실적) YYYY-MM-DD — Resolved/Closed 전환 시 자동, 직접 보정 가능")] DateTime? resolvedDate = null,
        [Description("분류 (자유 입력 단일값)")] string? category = null,
        [Description("커스텀 컬럼 값 맵 JSON 전체 교체 (예: {\"env\":\"prod\"})")] string? customFieldsJson = null)
    {
        var existing = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"Issue {id} 없음");
        return McpJson.Serialize(await svc.UpdateAsync(id, new UpdateIssueDto(
            Title: title ?? existing.Title,
            Description: description ?? existing.Description,
            Status: status ?? existing.Status,
            Priority: priority ?? existing.Priority,
            AssigneeResourceId: assigneeResourceId ?? existing.AssigneeResourceId,
            DueDate: dueDate ?? existing.DueDate,
            OccurredOn: occurredOn ?? existing.OccurredOn,
            ResolvedDate: resolvedDate ?? existing.ResolvedDate,
            Category: category ?? existing.Category,
            CustomFieldsJson: customFieldsJson ?? existing.CustomFieldsJson)));
    }

    [McpServerTool(Name = "atlas_issue_delete"),
     Description("이슈 삭제. 회의록 ActionItem.promotedIssueId 자동 정리")]
    public static async Task<string> Delete(IssueService svc, int id)
    {
        if (!await svc.DeleteAsync(id))
            throw new InvalidOperationException($"Issue {id} 없음");
        return McpJson.Serialize(new { deleted = true, id });
    }
}
