using System.ComponentModel;
using ModelContextProtocol.Server;
using ProjectManager.Application.Services;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Mcp.Tools;

// WBS ↔ 업무 정보(DevInfo) "관련 정보" 연결. 어셈블리 스캔(.WithToolsFromAssembly)으로 자동 등록.
[McpServerToolType]
public static class WbsDevInfoLinkTools
{
    [McpServerTool(Name = "atlas_wbs_devinfo_links"),
     Description("WBS 항목에 연결된 업무 정보(관련 정보) 목록 → JSON 배열")]
    public static async Task<string> ByWbs(WbsDevInfoLinkService svc, int wbsItemId) =>
        McpJson.Serialize(await svc.GetByWbsItemAsync(wbsItemId));

    [McpServerTool(Name = "atlas_devinfo_wbs_links"),
     Description("업무 정보 항목에 연결된 WBS 목록 → JSON 배열")]
    public static async Task<string> ByDevInfo(WbsDevInfoLinkService svc, int devInfoItemId) =>
        McpJson.Serialize(await svc.GetByDevInfoAsync(devInfoItemId));

    [McpServerTool(Name = "atlas_wbs_link_devinfo"),
     Description("WBS 항목에 업무 정보를 연결. 같은 프로젝트끼리만, 중복 불가")]
    public static async Task<string> Link(
        WbsDevInfoLinkService svc,
        [Description("WBS 항목 ID")] int wbsItemId,
        [Description("업무 정보(DevInfo) ID")] int devInfoItemId) =>
        McpJson.Serialize(await svc.CreateAsync(new CreateWbsDevInfoLinkDto(wbsItemId, devInfoItemId)));

    [McpServerTool(Name = "atlas_wbs_unlink_devinfo"),
     Description("WBS ↔ 업무 정보 연결 해제")]
    public static async Task<string> Unlink(
        WbsDevInfoLinkService svc,
        [Description("WBS 항목 ID")] int wbsItemId,
        [Description("업무 정보(DevInfo) ID")] int devInfoItemId)
    {
        if (!await svc.DeleteAsync(wbsItemId, devInfoItemId))
            throw new InvalidOperationException($"연결을 찾을 수 없습니다 (wbs {wbsItemId} ↔ devinfo {devInfoItemId}).");
        return McpJson.Serialize(new { unlinked = true, wbsItemId, devInfoItemId });
    }
}
