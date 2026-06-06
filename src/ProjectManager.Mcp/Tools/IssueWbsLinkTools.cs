using System.ComponentModel;
using ModelContextProtocol.Server;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Mcp.Tools;

// Issue ↔ WBS 연결. WbsDevInfoLinkTools 패턴 복제(IssueWbsLink 는 Type 보유). 어셈블리 스캔 자동 등록.
[McpServerToolType]
public static class IssueWbsLinkTools
{
    [McpServerTool(Name = "atlas_wbs_issue_links"),
     Description("WBS 항목에 연결된 이슈 목록 → JSON 배열 (issueTitle·type 포함)")]
    public static async Task<string> ByWbs(IssueWbsLinkService svc, int wbsItemId) =>
        McpJson.Serialize(await svc.GetByWbsItemAsync(wbsItemId));

    [McpServerTool(Name = "atlas_issue_wbs_links"),
     Description("이슈에 연결된 WBS 항목 목록 → JSON 배열 (wbsItemName·type 포함)")]
    public static async Task<string> ByIssue(IssueWbsLinkService svc, int issueId) =>
        McpJson.Serialize(await svc.GetByIssueAsync(issueId));

    [McpServerTool(Name = "atlas_issue_link_wbs"),
     Description("이슈에 WBS 항목을 연결. 같은 프로젝트끼리만, 중복 불가. type = RelatesTo(기본)|Blocks|ParentOf")]
    public static async Task<string> Link(
        IssueWbsLinkService svc,
        [Description("이슈 ID")] int issueId,
        [Description("WBS 항목 ID")] int wbsItemId,
        [Description("관계 유형 RelatesTo(기본)|Blocks|ParentOf")] IssueWbsLinkType type = IssueWbsLinkType.RelatesTo) =>
        McpJson.Serialize(await svc.CreateAsync(new CreateIssueWbsLinkDto(issueId, wbsItemId, type)));

    [McpServerTool(Name = "atlas_issue_unlink_wbs"),
     Description("이슈 ↔ WBS 연결 해제")]
    public static async Task<string> Unlink(
        IssueWbsLinkService svc,
        [Description("이슈 ID")] int issueId,
        [Description("WBS 항목 ID")] int wbsItemId)
    {
        if (!await svc.DeleteAsync(issueId, wbsItemId))
            throw new InvalidOperationException($"연결을 찾을 수 없습니다 (issue {issueId} ↔ wbs {wbsItemId}).");
        return McpJson.Serialize(new { unlinked = true, issueId, wbsItemId });
    }
}
