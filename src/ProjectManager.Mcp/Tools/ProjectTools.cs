using System.ComponentModel;
using ModelContextProtocol.Server;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Mcp.Tools;

[McpServerToolType]
public static class ProjectTools
{
    [McpServerTool(Name = "atlas_project_list"),
     Description("모든 Atlas 프로젝트 조회 → JSON 배열 (id/name/status/dates/...)")]
    public static async Task<string> List(ProjectService svc) =>
        McpJson.Serialize(await svc.GetAllAsync());

    [McpServerTool(Name = "atlas_project_get"), Description("단일 프로젝트 상세 조회")]
    public static async Task<string> Get(ProjectService svc, int id)
    {
        var dto = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"Project {id} 없음");
        return McpJson.Serialize(dto);
    }

    [McpServerTool(Name = "atlas_project_create"),
     Description("프로젝트 생성. status 는 Planned|Waiting|InProgress|Done (기본 Planned)")]
    public static async Task<string> Create(
        ProjectService svc,
        [Description("프로젝트 이름")] string name,
        [Description("프로젝트 구분 (과제|내부|사업|유지보수/하자보수 등 자유 문자열)")] string? category = null,
        [Description("설명")] string? description = null,
        [Description("목표")] string? goal = null,
        [Description("상태 Planned|Waiting|InProgress|Done")] ProjectStatus? status = null,
        [Description("시작일 YYYY-MM-DD")] DateTime? startDate = null,
        [Description("종료일 YYYY-MM-DD")] DateTime? endDate = null,
        [Description("예산")] decimal? budget = null,
        [Description("참여자 (자유 문자열)")] string? participants = null,
        [Description("산출물")] string? deliverables = null,
        [Description("관련 링크 (줄바꿈 구분)")] string? relatedLinks = null) =>
        McpJson.Serialize(await svc.CreateAsync(new CreateProjectDto(
            Name: name,
            Category: category ?? string.Empty,
            Description: description ?? string.Empty,
            Goal: goal ?? string.Empty,
            Status: status ?? ProjectStatus.Planned,
            StartDate: startDate,
            EndDate: endDate,
            Budget: budget,
            Participants: participants ?? string.Empty,
            Deliverables: deliverables ?? string.Empty,
            RelatedLinks: relatedLinks ?? string.Empty)));

    [McpServerTool(Name = "atlas_project_update"),
     Description("프로젝트 부분 갱신 — null 인 필드는 기존 값 유지")]
    public static async Task<string> Update(
        ProjectService svc, int id,
        string? name = null, string? category = null, string? description = null, string? goal = null,
        ProjectStatus? status = null,
        DateTime? startDate = null, DateTime? endDate = null,
        decimal? budget = null,
        string? participants = null, string? deliverables = null, string? relatedLinks = null)
    {
        var existing = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"Project {id} 없음");
        return McpJson.Serialize(await svc.UpdateAsync(id, new UpdateProjectDto(
            Name: name ?? existing.Name,
            Category: category ?? existing.Category,
            Description: description ?? existing.Description,
            Goal: goal ?? existing.Goal,
            Status: status ?? existing.Status,
            StartDate: startDate ?? existing.StartDate,
            EndDate: endDate ?? existing.EndDate,
            Budget: budget ?? existing.Budget,
            Participants: participants ?? existing.Participants,
            Deliverables: deliverables ?? existing.Deliverables,
            RelatedLinks: relatedLinks ?? existing.RelatedLinks)));
    }

    [McpServerTool(Name = "atlas_project_delete"),
     Description("프로젝트 삭제 (모든 하위 WBS/Issue/Meeting/ChangeLog cascade)")]
    public static async Task<string> Delete(ProjectService svc, int id)
    {
        if (!await svc.DeleteAsync(id))
            throw new InvalidOperationException($"Project {id} 없음");
        return McpJson.Serialize(new { deleted = true, id });
    }
}
