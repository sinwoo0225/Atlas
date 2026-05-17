using System.ComponentModel;
using ModelContextProtocol.Server;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Mcp.Tools;

[McpServerToolType]
public static class WbsTools
{
    [McpServerTool(Name = "atlas_wbs_list"),
     Description("프로젝트의 WBS 트리 조회 (root + children). version 옵션으로 특정 버전")]
    public static async Task<string> List(
        WbsService svc,
        [Description("프로젝트 ID")] int projectId,
        [Description("WBS 버전 ID (없으면 현재 버전)")] int? versionId = null) =>
        McpJson.Serialize(await svc.GetByProjectAsync(projectId, versionId));

    [McpServerTool(Name = "atlas_wbs_get"), Description("단일 WBS 항목 상세 조회")]
    public static async Task<string> Get(WbsService svc, int id)
    {
        var dto = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"WbsItem {id} 없음");
        return McpJson.Serialize(dto);
    }

    [McpServerTool(Name = "atlas_wbs_create"),
     Description("WBS 항목 생성. parentId 없으면 root, status 기본 Planned")]
    public static async Task<string> Create(
        WbsService svc,
        [Description("프로젝트 ID")] int projectId,
        [Description("이름")] string name,
        [Description("상위 WBS 항목 ID (없으면 root)")] int? parentId = null,
        [Description("WBS 버전 ID")] int? versionId = null,
        [Description("담당자 (자유 문자열)")] string? assignee = null,
        DateTime? startDate = null, DateTime? endDate = null,
        [Description("Planned|InProgress|Done")] WbsStatus? status = null,
        [Description("마일스톤 여부")] bool? isMilestone = null,
        [Description("중요도 1=낮음 / 2=중간 (기본) / 3=높음")] int? importance = null,
        string? notes = null) =>
        McpJson.Serialize(await svc.CreateAsync(new CreateWbsItemDto(
            ProjectId: projectId,
            VersionId: versionId,
            ParentId: parentId,
            Name: name,
            Assignee: assignee ?? string.Empty,
            StartDate: startDate,
            EndDate: endDate,
            Status: status ?? WbsStatus.Planned,
            IsMilestone: isMilestone ?? false,
            Importance: importance ?? 2,
            Notes: notes ?? string.Empty)));

    [McpServerTool(Name = "atlas_wbs_update"),
     Description("WBS 항목 부분 갱신 — null 인 필드는 기존 값 유지. root 로 옮기려면 atlas_wbs_move 사용")]
    public static async Task<string> Update(
        WbsService svc, int id,
        string? name = null,
        [Description("새 상위 ID. null 이면 현 parent 유지 (root 화는 atlas_wbs_move)")] int? parentId = null,
        string? assignee = null,
        DateTime? startDate = null, DateTime? endDate = null,
        WbsStatus? status = null, bool? isMilestone = null,
        [Description("중요도 1=낮음 / 2=중간 / 3=높음")] int? importance = null,
        [Description("정렬 위치 — 보통 생략 (신규 시 자동 끝에 추가, reorder 는 GUI dnd 사용)")] int? sortOrder = null,
        string? notes = null)
    {
        var existing = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"WbsItem {id} 없음");
        return McpJson.Serialize(await svc.UpdateAsync(id, new UpdateWbsItemDto(
            ParentId: parentId ?? existing.ParentId,
            Name: name ?? existing.Name,
            Assignee: assignee ?? existing.Assignee,
            StartDate: startDate ?? existing.StartDate,
            EndDate: endDate ?? existing.EndDate,
            Status: status ?? existing.Status,
            IsMilestone: isMilestone ?? existing.IsMilestone,
            Importance: importance ?? existing.Importance,
            Notes: notes ?? existing.Notes,
            SortOrder: sortOrder ?? existing.SortOrder,
            UpdatedAt: existing.UpdatedAt)));
    }

    [McpServerTool(Name = "atlas_wbs_move"),
     Description("WBS subtree 이동 (parent 변경 + Order 자동 재계산). root 로 옮기려면 root=true")]
    public static async Task<string> Move(
        WbsService svc,
        [Description("이동할 WBS 항목 ID")] int id,
        [Description("새 상위 ID. root 로 옮기려면 null + root=true")] int? parentId = null,
        [Description("true 면 root 로 이동 (parentId 무시)")] bool root = false)
    {
        if (parentId is null && !root)
            throw new InvalidOperationException("parentId 또는 root=true 중 하나가 필요합니다.");
        var existing = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"WbsItem {id} 없음");
        return McpJson.Serialize(await svc.UpdateAsync(id, new UpdateWbsItemDto(
            ParentId: root ? null : parentId,
            Name: existing.Name, Assignee: existing.Assignee,
            StartDate: existing.StartDate, EndDate: existing.EndDate,
            Status: existing.Status, IsMilestone: existing.IsMilestone,
            Importance: existing.Importance, Notes: existing.Notes,
            SortOrder: existing.SortOrder, // parentChanged 분기라 백엔드가 덮어씀
            UpdatedAt: existing.UpdatedAt)));
    }

    [McpServerTool(Name = "atlas_wbs_delete"),
     Description("WBS 항목 삭제. 회의록 ActionItem.promotedWbsItemId 자동 정리")]
    public static async Task<string> Delete(WbsService svc, int id)
    {
        if (!await svc.DeleteAsync(id))
            throw new InvalidOperationException($"WbsItem {id} 없음");
        return McpJson.Serialize(new { deleted = true, id });
    }
}
