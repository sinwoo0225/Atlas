using System.CommandLine;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Services;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Cli.Commands;

internal static class TemplateCommands
{
    // 노드 트리 JSON 역직렬화 — 빌트인/서비스와 동일하게 camelCase 키를 대소문자 무시로 매핑.
    private static readonly JsonSerializerOptions NodeJsonOpts = new() { PropertyNameCaseInsensitive = true };

    // --nodes-file 입력 — 경로 또는 '-'(stdin). PowerShell 의 UTF-8 BOM/공백 제거(Meeting 패턴과 동일).
    private static async Task<string?> ReadFileOrStdinAsync(string? path)
    {
        if (string.IsNullOrEmpty(path)) return null;
        var raw = path == "-" ? await Console.In.ReadToEndAsync() : await File.ReadAllTextAsync(path);
        return raw.Trim('﻿', ' ', '\r', '\n', '\t');
    }

    private static IReadOnlyList<WbsTemplateNodeDto> ParseNodes(string json) =>
        JsonSerializer.Deserialize<List<WbsTemplateNodeDto>>(json, NodeJsonOpts) ?? new();

    public static Command Build(IServiceProvider services)
    {
        var cmd = new Command("template", "WBS/일정 템플릿 (list/get/create/update/delete/apply/from-project)");
        cmd.AddCommand(BuildList(services));
        cmd.AddCommand(BuildGet(services));
        cmd.AddCommand(BuildCreate(services));
        cmd.AddCommand(BuildUpdate(services));
        cmd.AddCommand(BuildDelete(services));
        cmd.AddCommand(BuildApply(services));
        cmd.AddCommand(BuildFromProject(services));
        return cmd;
    }

    private static Command BuildList(IServiceProvider services)
    {
        var c = new Command("list", "템플릿 목록 (빌트인 + 커스텀) → JSON 배열. 노드 트리 제외, nodeCount 만.");
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var svc = services.GetRequiredService<WbsTemplateService>();
            CliJson.WriteSuccess(await svc.ListAsync());
        }));
        return c;
    }

    private static Command BuildGet(IServiceProvider services)
    {
        var idOpt = new Option<int?>("--id", "커스텀 템플릿 ID");
        var builtinOpt = new Option<string?>("--builtin", "빌트인 템플릿 key (list 의 builtinKey)");
        var c = new Command("get", "단일 템플릿 상세 (노드 트리 포함). --id 또는 --builtin 중 하나.") { idOpt, builtinOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var id = pr.GetValueForOption(idOpt);
            var key = pr.GetValueForOption(builtinOpt);
            if (id is null && string.IsNullOrEmpty(key))
            { ctx.ExitCode = CliJson.WriteError("bad_request", "--id 또는 --builtin 을 지정하세요"); return; }
            var svc = services.GetRequiredService<WbsTemplateService>();
            var dto = await svc.GetAsync(id, key);
            if (dto is null) { ctx.ExitCode = CliJson.WriteError("not_found", "템플릿 없음"); return; }
            CliJson.WriteSuccess(dto);
        }));
        return c;
    }

    private static Command BuildCreate(IServiceProvider services)
    {
        var nameOpt = new Option<string>("--name", "템플릿 이름") { IsRequired = true };
        var descOpt = new Option<string?>("--description", "설명");
        var catOpt = new Option<string?>("--category", "분류 (자유 문자열)");
        var nodesFileOpt = new Option<string?>("--nodes-file",
            "노드 트리 JSON 파일 경로 ('-' 이면 stdin). 배열 형식: " +
            "[{name,assignee,offsetStartDays,durationDays,isMilestone,importance,notes,children:[...]}]. " +
            "offsetStartDays=앵커(프로젝트 시작일)로부터 일수, durationDays=기간(마일스톤=0).") { IsRequired = true };
        var c = new Command("create", "커스텀 템플릿 생성") { nameOpt, descOpt, catOpt, nodesFileOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var json = await ReadFileOrStdinAsync(pr.GetValueForOption(nodesFileOpt));
            var dto = new CreateWbsTemplateDto(
                Name: pr.GetValueForOption(nameOpt)!,
                Description: pr.GetValueForOption(descOpt) ?? string.Empty,
                Category: pr.GetValueForOption(catOpt) ?? string.Empty,
                Nodes: ParseNodes(json ?? "[]"));
            var svc = services.GetRequiredService<WbsTemplateService>();
            CliJson.WriteSuccess(await svc.CreateAsync(dto));
        }));
        return c;
    }

    private static Command BuildUpdate(IServiceProvider services)
    {
        // null 인 옵션은 기존 값 유지. --nodes-file 미지정 시 기존 트리 유지.
        var idOpt = new Option<int>("--id", "커스텀 템플릿 ID") { IsRequired = true };
        var nameOpt = new Option<string?>("--name", "이름");
        var descOpt = new Option<string?>("--description", "설명");
        var catOpt = new Option<string?>("--category", "분류");
        var nodesFileOpt = new Option<string?>("--nodes-file", "노드 트리 JSON 파일/stdin('-'). 미지정 시 기존 트리 유지.");
        var c = new Command("update", "커스텀 템플릿 부분 갱신 (지정한 옵션만 덮어쓰기)")
        { idOpt, nameOpt, descOpt, catOpt, nodesFileOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var id = pr.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<WbsTemplateService>();
            var existing = await svc.GetAsync(id, null);
            if (existing is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"Template {id} 없음"); return; }
            var json = await ReadFileOrStdinAsync(pr.GetValueForOption(nodesFileOpt));
            var dto = new UpdateWbsTemplateDto(
                Name: pr.GetValueForOption(nameOpt) ?? existing.Name,
                Description: pr.GetValueForOption(descOpt) ?? existing.Description,
                Category: pr.GetValueForOption(catOpt) ?? existing.Category,
                Nodes: json is null ? existing.Nodes : ParseNodes(json),
                UpdatedAt: existing.UpdatedAt ?? DateTime.UtcNow);
            var updated = await svc.UpdateAsync(id, dto);
            if (updated is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"Template {id} 없음"); return; }
            CliJson.WriteSuccess(updated);
        }));
        return c;
    }

    private static Command BuildDelete(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "커스텀 템플릿 ID") { IsRequired = true };
        var c = new Command("delete", "커스텀 템플릿 삭제 (빌트인은 불가)") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<WbsTemplateService>();
            if (!await svc.DeleteAsync(id)) { ctx.ExitCode = CliJson.WriteError("not_found", $"Template {id} 없음"); return; }
            CliJson.WriteSuccess(new { deleted = true, id });
        }));
        return c;
    }

    private static Command BuildApply(IServiceProvider services)
    {
        var projOpt = new Option<int>("--project", "적용 대상 프로젝트 ID") { IsRequired = true };
        var idOpt = new Option<int?>("--id", "커스텀 템플릿 ID");
        var builtinOpt = new Option<string?>("--builtin", "빌트인 템플릿 key");
        var anchorOpt = new Option<DateTime?>("--anchor", "기준 시작일 YYYY-MM-DD (미지정 시 프로젝트 시작일 ?? 오늘)");
        var versionOpt = new Option<int?>("--version", "WBS 버전 ID (선택)");
        var skipWkOpt = new Option<bool>("--skip-weekends", "주말(토·일) 건너뛰고 영업일로 날짜 계산");
        var c = new Command("apply", "템플릿을 프로젝트 WBS 로 인스턴스화 (기존 WBS 뒤에 추가). --id 또는 --builtin.")
        { projOpt, idOpt, builtinOpt, anchorOpt, versionOpt, skipWkOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var id = pr.GetValueForOption(idOpt);
            var key = pr.GetValueForOption(builtinOpt);
            if (id is null && string.IsNullOrEmpty(key))
            { ctx.ExitCode = CliJson.WriteError("bad_request", "--id 또는 --builtin 을 지정하세요"); return; }
            var dto = new ApplyTemplateDto(
                TemplateId: id,
                BuiltinKey: key,
                AnchorDate: pr.GetValueForOption(anchorOpt),
                VersionId: pr.GetValueForOption(versionOpt),
                SkipWeekends: pr.GetValueForOption(skipWkOpt));
            var svc = services.GetRequiredService<WbsTemplateService>();
            var result = await svc.ApplyAsync(pr.GetValueForOption(projOpt), dto);
            if (result is null) { ctx.ExitCode = CliJson.WriteError("not_found", "프로젝트 없음"); return; }
            CliJson.WriteSuccess(result);
        }));
        return c;
    }

    private static Command BuildFromProject(IServiceProvider services)
    {
        var projOpt = new Option<int>("--project", "원본 프로젝트 ID") { IsRequired = true };
        var nameOpt = new Option<string>("--name", "새 템플릿 이름") { IsRequired = true };
        var descOpt = new Option<string?>("--description", "설명");
        var catOpt = new Option<string?>("--category", "분류");
        var versionOpt = new Option<int?>("--version", "WBS 버전 ID (선택)");
        var c = new Command("from-project", "기존 프로젝트 WBS 를 커스텀 템플릿으로 저장 (절대 날짜→최저 시작일 기준 상대 오프셋)")
        { projOpt, nameOpt, descOpt, catOpt, versionOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var dto = new CreateTemplateFromProjectDto(
                ProjectId: pr.GetValueForOption(projOpt),
                Name: pr.GetValueForOption(nameOpt)!,
                Description: pr.GetValueForOption(descOpt) ?? string.Empty,
                Category: pr.GetValueForOption(catOpt) ?? string.Empty,
                VersionId: pr.GetValueForOption(versionOpt));
            var svc = services.GetRequiredService<WbsTemplateService>();
            CliJson.WriteSuccess(await svc.CreateFromProjectAsync(dto));
        }));
        return c;
    }
}
