using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Cli.Commands;

internal static class ResourceCommands
{
    public static Command Build(IServiceProvider services)
    {
        // Resource 는 전역 — 다른 verb 와 달리 --project 없음.
        var cmd = new Command("resource", "리소스 (list/get/create/update/delete/assignments) — 전역 (프로젝트 무관)");
        cmd.AddCommand(BuildList(services));
        cmd.AddCommand(BuildGet(services));
        cmd.AddCommand(BuildCreate(services));
        cmd.AddCommand(BuildUpdate(services));
        cmd.AddCommand(BuildDelete(services));
        cmd.AddCommand(BuildAssignments(services));
        return cmd;
    }

    private static Command BuildList(IServiceProvider services)
    {
        var c = new Command("list", "모든 리소스 조회");
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var svc = services.GetRequiredService<ResourceService>();
            CliJson.WriteSuccess(await svc.GetAllAsync());
        }));
        return c;
    }

    private static Command BuildGet(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "리소스 ID") { IsRequired = true };
        var c = new Command("get", "단일 리소스 조회") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<ResourceService>();
            var dto = await svc.GetByIdAsync(id);
            if (dto is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"Resource {id} 없음"); return; }
            CliJson.WriteSuccess(dto);
        }));
        return c;
    }

    private static Command BuildCreate(IServiceProvider services)
    {
        var nameOpt = new Option<string>("--name", "이름") { IsRequired = true };
        var typeOpt = new Option<ResourceType?>("--type", "Person(기본)|Equipment");
        var deptOpt = new Option<string?>("--department", "부서");
        var emailOpt = new Option<string?>("--email", "이메일");
        var phoneOpt = new Option<string?>("--phone", "전화번호");
        var notesOpt = new Option<string?>("--notes", "비고 (자유 문자열)");

        var c = new Command("create", "리소스 생성") { nameOpt, typeOpt, deptOpt, emailOpt, phoneOpt, notesOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var dto = new CreateResourceDto(
                Name: pr.GetValueForOption(nameOpt)!,
                Type: pr.GetValueForOption(typeOpt) ?? ResourceType.Person,
                Department: pr.GetValueForOption(deptOpt) ?? string.Empty,
                Email: pr.GetValueForOption(emailOpt) ?? string.Empty,
                Phone: pr.GetValueForOption(phoneOpt) ?? string.Empty,
                Notes: pr.GetValueForOption(notesOpt) ?? string.Empty);
            var svc = services.GetRequiredService<ResourceService>();
            CliJson.WriteSuccess(await svc.CreateAsync(dto));
        }));
        return c;
    }

    private static Command BuildUpdate(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "리소스 ID") { IsRequired = true };
        var nameOpt = new Option<string?>("--name", "이름");
        var typeOpt = new Option<ResourceType?>("--type", "Person|Equipment");
        var deptOpt = new Option<string?>("--department", "부서");
        var emailOpt = new Option<string?>("--email", "이메일");
        var phoneOpt = new Option<string?>("--phone", "전화번호");
        var notesOpt = new Option<string?>("--notes", "비고");

        var c = new Command("update", "리소스 부분 갱신 (지정한 옵션만 덮어쓰기)")
        { idOpt, nameOpt, typeOpt, deptOpt, emailOpt, phoneOpt, notesOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var id = pr.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<ResourceService>();
            var existing = await svc.GetByIdAsync(id);
            if (existing is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"Resource {id} 없음"); return; }
            var dto = new UpdateResourceDto(
                Name: pr.GetValueForOption(nameOpt) ?? existing.Name,
                Type: pr.GetValueForOption(typeOpt) ?? existing.Type,
                Department: pr.GetValueForOption(deptOpt) ?? existing.Department,
                Email: pr.GetValueForOption(emailOpt) ?? existing.Email,
                Phone: pr.GetValueForOption(phoneOpt) ?? existing.Phone,
                Notes: pr.GetValueForOption(notesOpt) ?? existing.Notes);
            var updated = await svc.UpdateAsync(id, dto);
            if (updated is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"Resource {id} 없음"); return; }
            CliJson.WriteSuccess(updated);
        }));
        return c;
    }

    private static Command BuildDelete(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "리소스 ID") { IsRequired = true };
        var c = new Command("delete", "리소스 삭제") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<ResourceService>();
            var ok = await svc.DeleteAsync(id);
            if (!ok) { ctx.ExitCode = CliJson.WriteError("not_found", $"Resource {id} 없음"); return; }
            CliJson.WriteSuccess(new { deleted = true, id });
        }));
        return c;
    }

    private static Command BuildAssignments(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "리소스 ID") { IsRequired = true };
        var c = new Command("assignments", "이 리소스가 할당된 WBS 작업 목록 (Assignee 이름 매칭)") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<ResourceService>();
            CliJson.WriteSuccess(await svc.GetAssignmentsAsync(id));
        }));
        return c;
    }
}
