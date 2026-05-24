using System.ComponentModel;
using System.Text.Json;
using ModelContextProtocol.Server;
using ProjectManager.Application.Services;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Mcp.Tools;

[McpServerToolType]
public static class WbsTemplateTools
{
    // 노드 트리 JSON 역직렬화 — camelCase 키를 대소문자 무시로 매핑(서비스/빌트인과 동일).
    private static readonly JsonSerializerOptions NodeJsonOpts = new() { PropertyNameCaseInsensitive = true };

    private static IReadOnlyList<WbsTemplateNodeDto> ParseNodes(string? json) =>
        string.IsNullOrWhiteSpace(json)
            ? new List<WbsTemplateNodeDto>()
            : JsonSerializer.Deserialize<List<WbsTemplateNodeDto>>(json, NodeJsonOpts) ?? new();

    [McpServerTool(Name = "atlas_template_list"),
     Description("WBS/일정 템플릿 목록 (빌트인 + 커스텀). 노드 트리 제외, nodeCount 만. 빌트인은 builtinKey, 커스텀은 id 로 식별.")]
    public static async Task<string> List(WbsTemplateService svc) =>
        McpJson.Serialize(await svc.ListAsync());

    [McpServerTool(Name = "atlas_template_get"),
     Description("단일 템플릿 상세 (노드 트리 포함). id(커스텀) 또는 builtinKey(빌트인) 중 하나 지정.")]
    public static async Task<string> Get(WbsTemplateService svc, int? id = null, string? builtinKey = null)
    {
        var dto = await svc.GetAsync(id, builtinKey)
            ?? throw new InvalidOperationException("템플릿 없음 (id 또는 builtinKey 확인)");
        return McpJson.Serialize(dto);
    }

    [McpServerTool(Name = "atlas_template_create"),
     Description("커스텀 템플릿 생성. nodesJson 은 노드 트리 JSON 배열: " +
        "[{name,assignee,offsetStartDays,durationDays,isMilestone,importance,notes,children:[...]}]. " +
        "offsetStartDays=앵커(프로젝트 시작일)로부터 일수, durationDays=기간(마일스톤=0).")]
    public static async Task<string> Create(
        WbsTemplateService svc,
        [Description("템플릿 이름")] string name,
        [Description("노드 트리 JSON 배열")] string nodesJson,
        [Description("설명")] string? description = null,
        [Description("분류 (자유 문자열)")] string? category = null) =>
        McpJson.Serialize(await svc.CreateAsync(new CreateWbsTemplateDto(
            Name: name,
            Description: description ?? string.Empty,
            Category: category ?? string.Empty,
            Nodes: ParseNodes(nodesJson))));

    [McpServerTool(Name = "atlas_template_update"),
     Description("커스텀 템플릿 부분 갱신 — null 필드는 기존 값 유지. nodesJson 지정 시 트리 전체 교체.")]
    public static async Task<string> Update(
        WbsTemplateService svc, int id,
        string? name = null, string? description = null, string? category = null,
        [Description("노드 트리 JSON 배열 (미지정 시 기존 트리 유지)")] string? nodesJson = null)
    {
        var existing = await svc.GetAsync(id, null)
            ?? throw new InvalidOperationException($"Template {id} 없음");
        var updated = await svc.UpdateAsync(id, new UpdateWbsTemplateDto(
            Name: name ?? existing.Name,
            Description: description ?? existing.Description,
            Category: category ?? existing.Category,
            Nodes: nodesJson is null ? existing.Nodes : ParseNodes(nodesJson),
            UpdatedAt: existing.UpdatedAt ?? DateTime.UtcNow));
        return McpJson.Serialize(updated ?? throw new InvalidOperationException($"Template {id} 없음"));
    }

    [McpServerTool(Name = "atlas_template_delete"), Description("커스텀 템플릿 삭제 (빌트인은 불가)")]
    public static async Task<string> Delete(WbsTemplateService svc, int id)
    {
        if (!await svc.DeleteAsync(id))
            throw new InvalidOperationException($"Template {id} 없음");
        return McpJson.Serialize(new { deleted = true, id });
    }

    [McpServerTool(Name = "atlas_template_apply"),
     Description("템플릿을 프로젝트 WBS 로 인스턴스화 (기존 WBS 뒤에 추가). templateId(커스텀) 또는 builtinKey(빌트인) 중 하나. " +
        "anchorDate 미지정 시 프로젝트 시작일 ?? 오늘. skipWeekends=주말 건너뛰고 영업일 계산.")]
    public static async Task<string> Apply(
        WbsTemplateService svc,
        [Description("적용 대상 프로젝트 ID")] int projectId,
        int? templateId = null, string? builtinKey = null,
        DateTime? anchorDate = null, int? versionId = null, bool skipWeekends = false)
    {
        var result = await svc.ApplyAsync(projectId, new ApplyTemplateDto(
            TemplateId: templateId,
            BuiltinKey: builtinKey,
            AnchorDate: anchorDate,
            VersionId: versionId,
            SkipWeekends: skipWeekends))
            ?? throw new InvalidOperationException($"Project {projectId} 없음");
        return McpJson.Serialize(result);
    }

    [McpServerTool(Name = "atlas_template_from_project"),
     Description("기존 프로젝트 WBS 를 커스텀 템플릿으로 저장 (절대 날짜를 최저 시작일 기준 상대 오프셋으로 변환)")]
    public static async Task<string> FromProject(
        WbsTemplateService svc,
        [Description("원본 프로젝트 ID")] int projectId,
        [Description("새 템플릿 이름")] string name,
        string? description = null, string? category = null,
        [Description("WBS 버전 ID (선택)")] int? versionId = null) =>
        McpJson.Serialize(await svc.CreateFromProjectAsync(new CreateTemplateFromProjectDto(
            ProjectId: projectId,
            Name: name,
            Description: description ?? string.Empty,
            Category: category ?? string.Empty,
            VersionId: versionId)));
}
