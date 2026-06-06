using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Output;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Cli.Commands;

internal static class ChangeLogCommands
{
    // Content 입력 해석 — file/stdin 우선, 없으면 인라인 인자, 모두 null 이면 fallback.
    // PowerShell 5.1 의 native call 큰따옴표 strip 함정 회피 (file/stdin 은 안전).
    // BOM (U+FEFF) + 좌우 공백/개행 trim — Out-File -Encoding utf8 가 BOM 추가하기 때문.
    private static async Task<string> ResolveContentAsync(
        string? filePath, string? inline, string fallback)
    {
        if (!string.IsNullOrEmpty(filePath))
        {
            var raw = filePath == "-"
                ? await Console.In.ReadToEndAsync()
                : await File.ReadAllTextAsync(filePath);
            return raw.Trim('﻿', ' ', '\r', '\n', '\t');
        }
        return inline ?? fallback;
    }

    public static Command Build(IServiceProvider services)
    {
        var cmd = new Command("changelog", "변경이력 (list/get/create/update/delete)");
        cmd.AddCommand(BuildList(services));
        cmd.AddCommand(BuildGet(services));
        cmd.AddCommand(BuildCreate(services));
        cmd.AddCommand(BuildUpdate(services));
        cmd.AddCommand(BuildDelete(services));
        return cmd;
    }

    private static Command BuildList(IServiceProvider services)
    {
        var projOpt = new Option<int>("--project", "프로젝트 ID") { IsRequired = true };
        var impactOpt = CliOptions.EnumList<ImpactLevel>("--impact", "영향도 필터 (다중: High,Critical)");
        var fromOpt = new Option<DateTime?>("--from", "날짜 >= YYYY-MM-DD");
        var toOpt = new Option<DateTime?>("--to", "날짜 <= YYYY-MM-DD (해당일 포함)");
        var srcIssueOpt = new Option<int?>("--source-issue", "출처 Issue ID");
        var srcWbsOpt = new Option<int?>("--source-wbs", "출처 WBS 항목 ID");
        var keywordOpt = new Option<string?>("--keyword", "내용 부분일치");
        var view = new ListViewOptions();

        var c = new Command("list", "프로젝트 변경이력 조회 (필터 + 출력 셰이핑)")
        { projOpt, impactOpt, fromOpt, toOpt, srcIssueOpt, srcWbsOpt, keywordOpt };
        view.AddTo(c);
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var pid = pr.GetValueForOption(projOpt);
            var impacts = pr.GetValueForOption(impactOpt);
            var filter = new ChangeLogListFilter(
                Impacts: impacts is { Length: > 0 } ? impacts : null,
                From: pr.GetValueForOption(fromOpt),
                To: pr.GetValueForOption(toOpt),
                SourceIssueId: pr.GetValueForOption(srcIssueOpt),
                SourceWbsItemId: pr.GetValueForOption(srcWbsOpt),
                Keyword: pr.GetValueForOption(keywordOpt));
            var svc = services.GetRequiredService<ChangeLogService>();
            var list = await svc.GetByProjectAsync(pid, filter);
            CliJson.WriteList(list, view.Read(pr, BriefPresets.ChangeLog));
        }));
        return c;
    }

    private static Command BuildGet(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "변경이력 ID") { IsRequired = true };
        var c = new Command("get", "단일 변경이력 조회") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<ChangeLogService>();
            var dto = await svc.GetByIdAsync(id);
            if (dto is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"ChangeLog {id} 없음"); return; }
            CliJson.WriteSuccess(dto);
        }));
        return c;
    }

    private static Command BuildCreate(IServiceProvider services)
    {
        var projOpt = new Option<int>("--project", "프로젝트 ID") { IsRequired = true };
        var dateOpt = new Option<DateTime>("--date", "변경 날짜 YYYY-MM-DD") { IsRequired = true };
        var contentOpt = new Option<string?>("--content", "내용 (markdown) — 길면 --content-file 권장");
        var contentFileOpt = new Option<string?>("--content-file",
            "내용을 파일에서 읽기. '-' 이면 stdin. --content 보다 우선.");
        var impactOpt = new Option<ImpactLevel?>("--impact", "Low(기본)|Medium|High|Critical");
        var linksOpt = new Option<string?>("--related-doc-links", "관련 문서 링크 (자유 문자열)");
        var srcIssueOpt = new Option<int?>("--source-issue", "출처 Issue ID");
        var srcWbsOpt = new Option<int?>("--source-wbs", "출처 WBS 항목 ID");

        var c = new Command("create", "변경이력 생성")
        { projOpt, dateOpt, contentOpt, contentFileOpt, impactOpt, linksOpt, srcIssueOpt, srcWbsOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var content = await ResolveContentAsync(
                pr.GetValueForOption(contentFileOpt), pr.GetValueForOption(contentOpt), string.Empty);
            var dto = new CreateChangeLogDto(
                ProjectId: pr.GetValueForOption(projOpt),
                Date: pr.GetValueForOption(dateOpt),
                Content: content,
                Impact: pr.GetValueForOption(impactOpt) ?? ImpactLevel.Low,
                RelatedDocLinks: pr.GetValueForOption(linksOpt) ?? string.Empty,
                SourceIssueId: pr.GetValueForOption(srcIssueOpt),
                SourceWbsItemId: pr.GetValueForOption(srcWbsOpt));
            var svc = services.GetRequiredService<ChangeLogService>();
            CliJson.WriteSuccess(await svc.CreateAsync(dto));
        }));
        return c;
    }

    private static Command BuildUpdate(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "변경이력 ID") { IsRequired = true };
        var dateOpt = new Option<DateTime?>("--date", "변경 날짜 YYYY-MM-DD");
        var contentOpt = new Option<string?>("--content", "내용 (markdown)");
        var contentFileOpt = new Option<string?>("--content-file",
            "내용을 파일/stdin('-') 에서 읽기. --content 보다 우선. 둘 다 미지정 시 기존 값 유지.");
        var impactOpt = new Option<ImpactLevel?>("--impact", "Low|Medium|High|Critical");
        var linksOpt = new Option<string?>("--related-doc-links", "관련 문서 링크");
        var srcIssueOpt = new Option<int?>("--source-issue", "출처 Issue ID");
        var srcWbsOpt = new Option<int?>("--source-wbs", "출처 WBS 항목 ID");

        var c = new Command("update", "변경이력 부분 갱신 (지정한 옵션만 덮어쓰기)")
        { idOpt, dateOpt, contentOpt, contentFileOpt, impactOpt, linksOpt, srcIssueOpt, srcWbsOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var id = pr.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<ChangeLogService>();
            var existing = await svc.GetByIdAsync(id);
            if (existing is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"ChangeLog {id} 없음"); return; }
            var content = await ResolveContentAsync(
                pr.GetValueForOption(contentFileOpt), pr.GetValueForOption(contentOpt), existing.Content);
            var dto = new UpdateChangeLogDto(
                Date: pr.GetValueForOption(dateOpt) ?? existing.Date,
                Content: content,
                Impact: pr.GetValueForOption(impactOpt) ?? existing.Impact,
                RelatedDocLinks: pr.GetValueForOption(linksOpt) ?? existing.RelatedDocLinks,
                SourceIssueId: pr.GetValueForOption(srcIssueOpt) ?? existing.SourceIssueId,
                SourceWbsItemId: pr.GetValueForOption(srcWbsOpt) ?? existing.SourceWbsItemId,
                UpdatedAt: existing.UpdatedAt);
            var updated = await svc.UpdateAsync(id, dto);
            if (updated is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"ChangeLog {id} 없음"); return; }
            CliJson.WriteSuccess(updated);
        }));
        return c;
    }

    private static Command BuildDelete(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "변경이력 ID") { IsRequired = true };
        var c = new Command("delete", "변경이력 삭제") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<ChangeLogService>();
            var ok = await svc.DeleteAsync(id);
            if (!ok) { ctx.ExitCode = CliJson.WriteError("not_found", $"ChangeLog {id} 없음"); return; }
            CliJson.WriteSuccess(new { deleted = true, id });
        }));
        return c;
    }
}
