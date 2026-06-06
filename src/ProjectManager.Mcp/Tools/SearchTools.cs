using System.ComponentModel;
using ModelContextProtocol.Server;
using ProjectManager.Application.Search;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.Mcp.Tools;

[McpServerToolType]
public static class SearchTools
{
    // SearchService + AppDbContext 는 DI 주입(컨트롤러와 동일 패턴). query 이하만 도구 입력.
    [McpServerTool(Name = "atlas_search"),
     Description("전체 텍스트 검색 (FTS5 색인, 엔티티 횡단: Project/WbsItem/Issue/Meeting/ChangeLog/DevInfoItem/WorkLog). " +
                 "결과 행: type·id·projectId·title·snippet(<mark> 하이라이트)·updatedAt. 키워드만 알 때 가장 토큰 효율적 — 어느 엔티티인지 몰라도 한 번에 찾는다.")]
    public static async Task<string> Search(
        SearchService search,
        AppDbContext db,
        [Description("검색어 (공백 = AND, 부분일치)")] string query,
        [Description("프로젝트 ID 한정 (없으면 전역)")] int? projectId = null,
        [Description("타입 한정 (다중): Project|WbsItem|Issue|Meeting|ChangeLog|DevInfoItem|WorkLog")] string[]? types = null,
        [Description("최대 결과 수 (기본 50, 최대 200)")] int limit = 50)
    {
        var hits = await search.SearchAsync(db, query, types is { Length: > 0 } ? types : null, projectId, limit);
        return McpJson.Serialize(hits);
    }
}
