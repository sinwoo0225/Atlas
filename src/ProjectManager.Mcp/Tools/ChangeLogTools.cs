using System.ComponentModel;
using ModelContextProtocol.Server;
using ProjectManager.Application.Output;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Mcp.Tools;

[McpServerToolType]
public static class ChangeLogTools
{
    [McpServerTool(Name = "atlas_changelog_list"),
     Description("프로젝트 변경이력 조회 (필터 + 출력 셰이핑). impacts 영향도 다중, from/to 날짜 범위, sourceIssueId/sourceWbsItemId 출처.")]
    public static async Task<string> List(
        ChangeLogService svc,
        [Description("프로젝트 ID")] int projectId,
        [Description("영향도 다중 필터 (Low|Medium|High|Critical)")] ImpactLevel[]? impacts = null,
        [Description("날짜 >= YYYY-MM-DD")] DateTime? from = null,
        [Description("날짜 <= YYYY-MM-DD (해당일 포함)")] DateTime? to = null,
        [Description("출처 Issue ID")] int? sourceIssueId = null,
        [Description("출처 WBS 항목 ID")] int? sourceWbsItemId = null,
        [Description("내용 부분일치")] string? keyword = null,
        [Description("개수만 반환")] bool count = false,
        [Description("최대 N 건")] int? limit = null,
        [Description("축약 필드만")] bool brief = false,
        [Description("쉼표구분 필드만 (예: id,date,impact)")] string? fields = null)
    {
        var filter = new ChangeLogListFilter(
            Impacts: impacts is { Length: > 0 } ? impacts : null,
            From: from, To: to,
            SourceIssueId: sourceIssueId, SourceWbsItemId: sourceWbsItemId,
            Keyword: keyword);
        var list = await svc.GetByProjectAsync(projectId, filter);
        return McpJson.SerializeList(list, McpJson.View(count, limit, brief, fields, BriefPresets.ChangeLog));
    }

    [McpServerTool(Name = "atlas_changelog_get"), Description("단일 변경이력 조회")]
    public static async Task<string> Get(ChangeLogService svc, int id)
    {
        var dto = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"ChangeLog {id} 없음");
        return McpJson.Serialize(dto);
    }

    [McpServerTool(Name = "atlas_changelog_create"),
     Description("변경이력 생성. impact 는 Low|Medium|High|Critical (기본 Low)")]
    public static async Task<string> Create(
        ChangeLogService svc,
        [Description("프로젝트 ID")] int projectId,
        [Description("변경 날짜 YYYY-MM-DD")] DateTime date,
        [Description("내용 (markdown)")] string content,
        [Description("영향도 Low|Medium|High|Critical")] ImpactLevel? impact = null,
        [Description("관련 문서 링크 (자유 문자열)")] string? relatedDocLinks = null,
        [Description("출처 Issue ID")] int? sourceIssueId = null,
        [Description("출처 WBS 항목 ID")] int? sourceWbsItemId = null) =>
        McpJson.Serialize(await svc.CreateAsync(new CreateChangeLogDto(
            ProjectId: projectId,
            Date: date,
            Content: content,
            Impact: impact ?? ImpactLevel.Low,
            RelatedDocLinks: relatedDocLinks ?? string.Empty,
            SourceIssueId: sourceIssueId,
            SourceWbsItemId: sourceWbsItemId)));

    [McpServerTool(Name = "atlas_changelog_update"),
     Description("변경이력 부분 갱신 — null 인 필드는 기존 값 유지")]
    public static async Task<string> Update(
        ChangeLogService svc, int id,
        DateTime? date = null, string? content = null,
        ImpactLevel? impact = null, string? relatedDocLinks = null,
        int? sourceIssueId = null, int? sourceWbsItemId = null)
    {
        var existing = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"ChangeLog {id} 없음");
        var updated = await svc.UpdateAsync(id, new UpdateChangeLogDto(
            Date: date ?? existing.Date,
            Content: content ?? existing.Content,
            Impact: impact ?? existing.Impact,
            RelatedDocLinks: relatedDocLinks ?? existing.RelatedDocLinks,
            SourceIssueId: sourceIssueId ?? existing.SourceIssueId,
            SourceWbsItemId: sourceWbsItemId ?? existing.SourceWbsItemId,
            UpdatedAt: existing.UpdatedAt));
        return McpJson.Serialize(updated);
    }

    [McpServerTool(Name = "atlas_changelog_delete"), Description("변경이력 삭제")]
    public static async Task<string> Delete(ChangeLogService svc, int id)
    {
        if (!await svc.DeleteAsync(id))
            throw new InvalidOperationException($"ChangeLog {id} 없음");
        return McpJson.Serialize(new { deleted = true, id });
    }
}
