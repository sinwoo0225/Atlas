using ProjectManager.Core.DTOs;

namespace ProjectManager.Application.Services;

// WBS 작업 한 건의 종합 컨텍스트를 기존 서비스들을 조합해 한 번에 반환.
// 새 repo 없음 — WbsService/링크 서비스/DevInfo·Issue·ChangeLog 서비스를 그대로 엮는다.
public class WbsContextService(
    WbsService wbsService,
    WbsDevInfoLinkService devInfoLinkService,
    IssueWbsLinkService issueLinkService,
    DevInfoService devInfoService,
    IssueService issueService,
    ChangeLogService changeLogService)
{
    public async Task<WbsContextDto?> GetContextAsync(
        int wbsItemId,
        bool includeChildren = true,
        bool includeDevInfo = true,
        bool includeIssues = true,
        bool includeChangeLogs = true)
    {
        var full = await wbsService.GetByIdAsync(wbsItemId);
        if (full is null) return null;

        var item = full with { Children = null };  // Children 은 별도 필드로 분리(중복 방지)
        var children = includeChildren
            ? (full.Children ?? Enumerable.Empty<WbsItemDto>()).ToList()
            : new List<WbsItemDto>();

        // 연결된 업무 정보 — 링크는 Title/Type 만 주므로 풀 DTO(FilePath·Content)로 재조회.
        var devinfo = new List<DevInfoItemDto>();
        if (includeDevInfo)
            foreach (var link in await devInfoLinkService.GetByWbsItemAsync(wbsItemId))
            {
                var d = await devInfoService.GetByIdAsync(link.DevInfoItemId);
                if (d is not null) devinfo.Add(d);
            }

        // 연결된 이슈 — 풀 DTO 로 재조회(설명·상태 포함).
        var issues = new List<IssueDto>();
        if (includeIssues)
            foreach (var link in await issueLinkService.GetByWbsItemAsync(wbsItemId))
            {
                var i = await issueService.GetByIdAsync(link.IssueId);
                if (i is not null) issues.Add(i);
            }

        // 이 작업이 출처인 변경이력 (Phase 3 ChangeLogListFilter.SourceWbsItemId 활용).
        var changelogs = includeChangeLogs
            ? (await changeLogService.GetByProjectAsync(full.ProjectId,
                new ChangeLogListFilter(SourceWbsItemId: wbsItemId))).ToList()
            : new List<ChangeLogDto>();

        return new WbsContextDto(item, children, devinfo, issues, changelogs);
    }
}
