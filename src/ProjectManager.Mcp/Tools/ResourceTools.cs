using System.ComponentModel;
using ModelContextProtocol.Server;
using ProjectManager.Application.Output;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Mcp.Tools;

[McpServerToolType]
public static class ResourceTools
{
    [McpServerTool(Name = "atlas_resource_list"),
     Description("리소스 조회 (전역 — 프로젝트 무관). type/부서/키워드 필터 + 출력 셰이핑.")]
    public static async Task<string> List(
        ResourceService svc,
        [Description("Person | Equipment (없으면 전부)")] ResourceType? type = null,
        [Description("부서 부분일치")] string? department = null,
        [Description("이름·이메일 부분일치")] string? keyword = null,
        [Description("개수만 반환")] bool count = false,
        [Description("최대 N 건")] int? limit = null,
        [Description("축약 필드만")] bool brief = false,
        [Description("쉼표구분 필드만 (예: id,name,type)")] string? fields = null)
    {
        var filter = new ResourceListFilter(Type: type, Department: department, Keyword: keyword);
        var list = await svc.GetAllAsync(filter);
        return McpJson.SerializeList(list, McpJson.View(count, limit, brief, fields, BriefPresets.Resource));
    }

    [McpServerTool(Name = "atlas_resource_get"), Description("단일 리소스 조회")]
    public static async Task<string> Get(ResourceService svc, int id)
    {
        var dto = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"Resource {id} 없음");
        return McpJson.Serialize(dto);
    }

    [McpServerTool(Name = "atlas_resource_create"),
     Description("리소스 생성. type 은 Person(기본)|Equipment")]
    public static async Task<string> Create(
        ResourceService svc,
        [Description("이름")] string name,
        [Description("타입 Person|Equipment")] ResourceType? type = null,
        [Description("부서")] string? department = null,
        [Description("이메일")] string? email = null,
        [Description("전화번호")] string? phone = null,
        [Description("비고")] string? notes = null) =>
        McpJson.Serialize(await svc.CreateAsync(new CreateResourceDto(
            Name: name,
            Type: type ?? ResourceType.Person,
            Department: department ?? string.Empty,
            Email: email ?? string.Empty,
            Phone: phone ?? string.Empty,
            Notes: notes ?? string.Empty)));

    [McpServerTool(Name = "atlas_resource_update"),
     Description("리소스 부분 갱신 — null 인 필드는 기존 값 유지")]
    public static async Task<string> Update(
        ResourceService svc, int id,
        string? name = null, ResourceType? type = null,
        string? department = null, string? email = null,
        string? phone = null, string? notes = null)
    {
        var existing = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"Resource {id} 없음");
        var updated = await svc.UpdateAsync(id, new UpdateResourceDto(
            Name: name ?? existing.Name,
            Type: type ?? existing.Type,
            Department: department ?? existing.Department,
            Email: email ?? existing.Email,
            Phone: phone ?? existing.Phone,
            Notes: notes ?? existing.Notes));
        return McpJson.Serialize(updated);
    }

    [McpServerTool(Name = "atlas_resource_delete"), Description("리소스 삭제")]
    public static async Task<string> Delete(ResourceService svc, int id)
    {
        if (!await svc.DeleteAsync(id))
            throw new InvalidOperationException($"Resource {id} 없음");
        return McpJson.Serialize(new { deleted = true, id });
    }

    [McpServerTool(Name = "atlas_resource_assignments"),
     Description("이 리소스가 할당된 WBS 작업 목록 (Assignee 이름 매칭)")]
    public static async Task<string> Assignments(ResourceService svc, int id) =>
        McpJson.Serialize(await svc.GetAssignmentsAsync(id));

    [McpServerTool(Name = "atlas_resource_resolve"),
     Description("이름으로 Person 리소스를 찾고 없으면 생성해 반환(멱등). '나' 신원 통일·담당자 매핑용.")]
    public static async Task<string> Resolve(
        ResourceService svc,
        [Description("이름")] string name) =>
        McpJson.Serialize(await svc.GetOrCreateByNameAsync(name));
}
