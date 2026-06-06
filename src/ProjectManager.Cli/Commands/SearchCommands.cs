using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Search;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.Cli.Commands;

// 전체 텍스트 검색 — 기존 FTS5 색인(SearchService, 증분 인터셉터로 항상 최신)을 CLI 로 노출.
// 엔티티 타입을 몰라도 키워드 한 번으로 횡단 조회 → 에이전트가 전체 dump 없이 바로 타깃에 도달.
internal static class SearchCommands
{
    public static Command Build(IServiceProvider services)
    {
        var queryArg = new Argument<string>("query", "검색어 (공백 = AND, 부분일치)");
        var projOpt = new Option<int?>("--project", "프로젝트 ID 로 한정 (없으면 전역)");
        var typeOpt = CliOptions.StringList("--type",
            "타입 한정 (다중): Project|WbsItem|Issue|Meeting|ChangeLog|DevInfoItem|WorkLog");
        var limitOpt = new Option<int>("--limit", () => 50, "최대 결과 수 (기본 50, 최대 200)");

        var c = new Command("search",
            "전체 텍스트 검색 (FTS5, 엔티티 횡단). 결과 행: type·id·projectId·title·snippet(<mark> 하이라이트)·updatedAt")
        { queryArg, projOpt, typeOpt, limitOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var query = pr.GetValueForArgument(queryArg);
            var pid = pr.GetValueForOption(projOpt);
            var types = pr.GetValueForOption(typeOpt);
            var limit = pr.GetValueForOption(limitOpt);
            var search = services.GetRequiredService<SearchService>();
            var db = services.GetRequiredService<AppDbContext>();
            var hits = await search.SearchAsync(db, query, types is { Length: > 0 } ? types : null, pid, limit);
            CliJson.WriteSuccess(hits);
        }));
        return c;
    }
}
