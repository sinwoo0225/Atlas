using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Cli.Commands;

internal static class DevInfoCommands
{
    // Content 가 multiline markdown 일 수 있어 file/stdin 옵션 제공.
    private static async Task<string?> ResolveAsync(string? filePath, string? inline)
    {
        if (!string.IsNullOrEmpty(filePath))
        {
            var raw = filePath == "-"
                ? await Console.In.ReadToEndAsync()
                : await File.ReadAllTextAsync(filePath);
            return raw.Trim('﻿', ' ', '\r', '\n', '\t');
        }
        return inline;
    }

    public static Command Build(IServiceProvider services)
    {
        var cmd = new Command("devinfo", "개발 정보 (list/get/create/update/delete/tags)");
        cmd.AddCommand(BuildList(services));
        cmd.AddCommand(BuildGet(services));
        cmd.AddCommand(BuildCreate(services));
        cmd.AddCommand(BuildUpdate(services));
        cmd.AddCommand(BuildDelete(services));
        cmd.AddCommand(BuildTags(services));
        return cmd;
    }

    private static Command BuildList(IServiceProvider services)
    {
        var projOpt = new Option<int>("--project", "프로젝트 ID") { IsRequired = true };
        var c = new Command("list", "프로젝트 개발 정보 조회") { projOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pid = ctx.ParseResult.GetValueForOption(projOpt);
            var svc = services.GetRequiredService<DevInfoService>();
            CliJson.WriteSuccess(await svc.GetByProjectAsync(pid));
        }));
        return c;
    }

    private static Command BuildGet(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "개발 정보 ID") { IsRequired = true };
        var c = new Command("get", "단일 개발 정보 조회") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<DevInfoService>();
            var dto = await svc.GetByIdAsync(id);
            if (dto is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"DevInfoItem {id} 없음"); return; }
            CliJson.WriteSuccess(dto);
        }));
        return c;
    }

    private static Command BuildCreate(IServiceProvider services)
    {
        var projOpt = new Option<int>("--project", "프로젝트 ID") { IsRequired = true };
        var titleOpt = new Option<string>("--title", "제목") { IsRequired = true };
        var typeOpt = new Option<DevInfoType>("--type", "Markdown|File|Link") { IsRequired = true };
        var storageOpt = new Option<DevInfoStorageMode?>("--storage", "Copy(기본)|Reference — File 타입에만 의미");
        var contentOpt = new Option<string?>("--content", "내용 (markdown — Markdown 타입에 사용)");
        var contentFileOpt = new Option<string?>("--content-file", "내용을 파일/stdin('-') 에서 읽기 — --content 보다 우선");
        var filePathOpt = new Option<string?>("--file-path", "파일 경로 (File 타입에 사용 — Copy 면 백엔드가 DevFiles 로 복사)");
        var urlOpt = new Option<string?>("--url", "URL (Link 타입에 사용)");
        var tagsOpt = new Option<string?>("--tags", "콤마 구분 태그 (예: \"api, auth\")");

        var c = new Command("create", "개발 정보 생성 (Markdown 타입은 디스크에 .md 파일도 자동 export)")
        { projOpt, titleOpt, typeOpt, storageOpt, contentOpt, contentFileOpt, filePathOpt, urlOpt, tagsOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var content = await ResolveAsync(pr.GetValueForOption(contentFileOpt), pr.GetValueForOption(contentOpt)) ?? string.Empty;
            var dto = new CreateDevInfoItemDto(
                ProjectId: pr.GetValueForOption(projOpt),
                Title: pr.GetValueForOption(titleOpt)!,
                Type: pr.GetValueForOption(typeOpt),
                StorageMode: pr.GetValueForOption(storageOpt) ?? DevInfoStorageMode.Copy,
                Content: content,
                FilePath: pr.GetValueForOption(filePathOpt) ?? string.Empty,
                Url: pr.GetValueForOption(urlOpt) ?? string.Empty,
                Tags: pr.GetValueForOption(tagsOpt) ?? string.Empty);
            var svc = services.GetRequiredService<DevInfoService>();
            CliJson.WriteSuccess(await svc.CreateAsync(dto));
        }));
        return c;
    }

    private static Command BuildUpdate(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "개발 정보 ID") { IsRequired = true };
        var titleOpt = new Option<string?>("--title", "제목");
        var typeOpt = new Option<DevInfoType?>("--type", "Markdown|File|Link");
        var storageOpt = new Option<DevInfoStorageMode?>("--storage", "Copy|Reference");
        var contentOpt = new Option<string?>("--content", "내용 (markdown)");
        var contentFileOpt = new Option<string?>("--content-file", "내용을 파일/stdin('-') 에서 읽기 — --content 보다 우선. 둘 다 미지정 시 기존 값 유지.");
        var filePathOpt = new Option<string?>("--file-path", "파일 경로");
        var urlOpt = new Option<string?>("--url", "URL");
        var tagsOpt = new Option<string?>("--tags", "콤마 구분 태그");

        var c = new Command("update", "개발 정보 부분 갱신 (지정한 옵션만 덮어쓰기)")
        { idOpt, titleOpt, typeOpt, storageOpt, contentOpt, contentFileOpt, filePathOpt, urlOpt, tagsOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var id = pr.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<DevInfoService>();
            var existing = await svc.GetByIdAsync(id);
            if (existing is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"DevInfoItem {id} 없음"); return; }
            var content = await ResolveAsync(pr.GetValueForOption(contentFileOpt), pr.GetValueForOption(contentOpt)) ?? existing.Content;
            var dto = new UpdateDevInfoItemDto(
                Title: pr.GetValueForOption(titleOpt) ?? existing.Title,
                Type: pr.GetValueForOption(typeOpt) ?? existing.Type,
                StorageMode: pr.GetValueForOption(storageOpt) ?? existing.StorageMode,
                Content: content,
                FilePath: pr.GetValueForOption(filePathOpt) ?? existing.FilePath,
                Url: pr.GetValueForOption(urlOpt) ?? existing.Url,
                Tags: pr.GetValueForOption(tagsOpt) ?? existing.Tags);
            var updated = await svc.UpdateAsync(id, dto);
            if (updated is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"DevInfoItem {id} 없음"); return; }
            CliJson.WriteSuccess(updated);
        }));
        return c;
    }

    private static Command BuildDelete(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "개발 정보 ID") { IsRequired = true };
        var c = new Command("delete", "개발 정보 삭제 (Markdown / Copy 모드는 디스크 파일도 함께 제거)") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<DevInfoService>();
            var ok = await svc.DeleteAsync(id);
            if (!ok) { ctx.ExitCode = CliJson.WriteError("not_found", $"DevInfoItem {id} 없음"); return; }
            CliJson.WriteSuccess(new { deleted = true, id });
        }));
        return c;
    }

    private static Command BuildTags(IServiceProvider services)
    {
        var projOpt = new Option<int>("--project", "프로젝트 ID") { IsRequired = true };
        var sortOpt = new Option<string?>("--sort", "alpha(기본) | freq (사용 빈도 내림차순)");
        var c = new Command("tags", "프로젝트 DevInfo 의 distinct 태그 list (대소문자 무관 distinct)") { projOpt, sortOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pid = ctx.ParseResult.GetValueForOption(projOpt);
            var sort = ctx.ParseResult.GetValueForOption(sortOpt);
            var svc = services.GetRequiredService<DevInfoService>();
            CliJson.WriteSuccess(await svc.GetDistinctTagsAsync(pid, sort));
        }));
        return c;
    }
}
