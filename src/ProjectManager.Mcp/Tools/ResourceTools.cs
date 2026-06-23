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
        [Description("비고")] string? notes = null,
        [Description("주당 가용 시간 (기본 40) — 용량 계획 기준")] double? weeklyCapacityHours = null,
        [Description("원가 단가(시간당)")] decimal? costRate = null,
        [Description("청구 단가(시간당)")] decimal? billRate = null,
        [Description("스킬 태그 (콤마 구분)")] string? skills = null,
        [Description("활성 여부 (기본 활성)")] bool? isActive = null) =>
        McpJson.Serialize(await svc.CreateAsync(new CreateResourceDto(
            Name: name,
            Type: type ?? ResourceType.Person,
            Department: department ?? string.Empty,
            Email: email ?? string.Empty,
            Phone: phone ?? string.Empty,
            Notes: notes ?? string.Empty,
            WeeklyCapacityHours: weeklyCapacityHours ?? 40,
            CostRate: costRate,
            BillRate: billRate,
            Skills: skills ?? string.Empty,
            IsActive: isActive ?? true)));

    [McpServerTool(Name = "atlas_resource_update"),
     Description("리소스 부분 갱신 — null 인 필드는 기존 값 유지")]
    public static async Task<string> Update(
        ResourceService svc, int id,
        string? name = null, ResourceType? type = null,
        string? department = null, string? email = null,
        string? phone = null, string? notes = null,
        [Description("주당 가용 시간 — 용량 계획 기준")] double? weeklyCapacityHours = null,
        decimal? costRate = null, decimal? billRate = null,
        [Description("스킬 태그 (콤마 구분)")] string? skills = null,
        [Description("활성 여부")] bool? isActive = null)
    {
        var existing = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"Resource {id} 없음");
        var updated = await svc.UpdateAsync(id, new UpdateResourceDto(
            Name: name ?? existing.Name,
            Type: type ?? existing.Type,
            Department: department ?? existing.Department,
            Email: email ?? existing.Email,
            Phone: phone ?? existing.Phone,
            Notes: notes ?? existing.Notes,
            WeeklyCapacityHours: weeklyCapacityHours ?? existing.WeeklyCapacityHours,
            CostRate: costRate ?? existing.CostRate,
            BillRate: billRate ?? existing.BillRate,
            Skills: skills ?? existing.Skills,
            IsActive: isActive ?? existing.IsActive));
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

    [McpServerTool(Name = "atlas_resource_capacity"),
     Description("자원 용량 — 주별 수요(배정 작업 공수 영업일 분배) vs 가용 → 가동률·과배분. id 생략 시 전 자원 히트맵.")]
    public static async Task<string> Capacity(
        CapacityService svc,
        [Description("자원 ID (생략 시 전 자원 히트맵)")] int? id = null,
        [Description("조회 주 수 (기본 8)")] int weeks = 8)
    {
        if (id is int rid)
        {
            var row = await svc.GetResourceCapacityAsync(rid, weeks)
                ?? throw new InvalidOperationException($"Resource {rid} 없음");
            return McpJson.Serialize(row);
        }
        return McpJson.Serialize(await svc.GetHeatmapAsync(weeks));
    }

    [McpServerTool(Name = "atlas_resource_utilization"),
     Description("교차 프로젝트 가동률 리포트 — 자원별 기간 합계·평균 가동률·과배분 주수. 과배분 자원 식별용.")]
    public static async Task<string> Utilization(
        CapacityService svc,
        [Description("조회 주 수 (기본 8)")] int weeks = 8,
        [Description("부서 필터")] string? department = null) =>
        McpJson.Serialize(await svc.GetUtilizationReportAsync(weeks, department));
}
