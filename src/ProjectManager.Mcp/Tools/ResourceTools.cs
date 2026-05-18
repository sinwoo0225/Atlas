using System.ComponentModel;
using ModelContextProtocol.Server;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Mcp.Tools;

[McpServerToolType]
public static class ResourceTools
{
    [McpServerTool(Name = "atlas_resource_list"),
     Description("모든 리소스 조회 (전역 — 프로젝트 무관)")]
    public static async Task<string> List(ResourceService svc) =>
        McpJson.Serialize(await svc.GetAllAsync());

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
}
