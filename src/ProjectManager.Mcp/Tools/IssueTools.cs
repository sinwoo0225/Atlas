using System.ComponentModel;
using ModelContextProtocol.Server;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Mcp.Tools;

[McpServerToolType]
public static class IssueTools
{
    [McpServerTool(Name = "atlas_issue_list"),
     Description("프로젝트의 이슈 목록 조회. status 옵션으로 필터 (Open|InProgress|Resolved|Closed)")]
    public static async Task<string> List(
        IssueService svc,
        [Description("프로젝트 ID")] int projectId,
        [Description("필터 — 없으면 전체")] IssueStatus? status = null)
    {
        var list = await svc.GetByProjectAsync(projectId);
        if (status is not null) list = list.Where(i => i.Status == status.Value);
        return McpJson.Serialize(list);
    }

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
        [Description("발생일자 YYYY-MM-DD (이슈가 실제 발생한 시점)")] DateTime? occurredOn = null) =>
        McpJson.Serialize(await svc.CreateAsync(new CreateIssueDto(
            ProjectId: projectId,
            Title: title,
            Description: description ?? string.Empty,
            Status: status ?? IssueStatus.Open,
            Priority: priority ?? IssuePriority.Medium,
            AssigneeResourceId: assigneeResourceId,
            DueDate: dueDate,
            OccurredOn: occurredOn)));

    [McpServerTool(Name = "atlas_issue_update"),
     Description("이슈 부분 갱신 — null 인 필드는 기존 값 유지")]
    public static async Task<string> Update(
        IssueService svc, int id,
        string? title = null, string? description = null,
        IssueStatus? status = null, IssuePriority? priority = null,
        int? assigneeResourceId = null, DateTime? dueDate = null,
        DateTime? occurredOn = null)
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
            OccurredOn: occurredOn ?? existing.OccurredOn)));
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
