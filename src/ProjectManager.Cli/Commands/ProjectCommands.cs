using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Cli.Commands;

internal static class ProjectCommands
{
    public static Command Build(IServiceProvider services)
    {
        var cmd = new Command("project", "프로젝트 (list/get/create/update/delete)");
        cmd.AddCommand(BuildList(services));
        cmd.AddCommand(BuildGet(services));
        cmd.AddCommand(BuildCreate(services));
        cmd.AddCommand(BuildUpdate(services));
        cmd.AddCommand(BuildDelete(services));
        return cmd;
    }

    private static Command BuildList(IServiceProvider services)
    {
        var c = new Command("list", "모든 프로젝트 조회 → JSON 배열");
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var svc = services.GetRequiredService<ProjectService>();
            CliJson.WriteSuccess(await svc.GetAllAsync());
        }));
        return c;
    }

    private static Command BuildGet(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "프로젝트 ID") { IsRequired = true };
        var c = new Command("get", "단일 프로젝트 조회") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<ProjectService>();
            var dto = await svc.GetByIdAsync(id);
            if (dto is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"Project {id} 없음"); return; }
            CliJson.WriteSuccess(dto);
        }));
        return c;
    }

    private static Command BuildCreate(IServiceProvider services)
    {
        var nameOpt = new Option<string>("--name", "이름") { IsRequired = true };
        var descOpt = new Option<string?>("--description", "설명");
        var goalOpt = new Option<string?>("--goal", "목표");
        var statusOpt = new Option<ProjectStatus?>("--status", "Planned|Waiting|InProgress|Done");
        var startOpt = new Option<DateTime?>("--start", "시작일 YYYY-MM-DD");
        var endOpt = new Option<DateTime?>("--end", "종료일 YYYY-MM-DD");
        var budgetOpt = new Option<decimal?>("--budget", "예산");
        var partOpt = new Option<string?>("--participants", "참여자");
        var delivOpt = new Option<string?>("--deliverables", "산출물");
        var linksOpt = new Option<string?>("--links", "관련 링크");

        var c = new Command("create", "프로젝트 생성")
        { nameOpt, descOpt, goalOpt, statusOpt, startOpt, endOpt, budgetOpt, partOpt, delivOpt, linksOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var dto = new CreateProjectDto(
                Name: pr.GetValueForOption(nameOpt)!,
                Description: pr.GetValueForOption(descOpt) ?? string.Empty,
                Goal: pr.GetValueForOption(goalOpt) ?? string.Empty,
                Status: pr.GetValueForOption(statusOpt) ?? ProjectStatus.Planned,
                StartDate: pr.GetValueForOption(startOpt),
                EndDate: pr.GetValueForOption(endOpt),
                Budget: pr.GetValueForOption(budgetOpt),
                Participants: pr.GetValueForOption(partOpt) ?? string.Empty,
                Deliverables: pr.GetValueForOption(delivOpt) ?? string.Empty,
                RelatedLinks: pr.GetValueForOption(linksOpt) ?? string.Empty);
            var svc = services.GetRequiredService<ProjectService>();
            CliJson.WriteSuccess(await svc.CreateAsync(dto));
        }));
        return c;
    }

    private static Command BuildUpdate(IServiceProvider services)
    {
        // null 인 옵션은 기존 값 유지 — Update 는 "지정한 필드만 덮어쓰기" 패턴.
        var idOpt = new Option<int>("--id", "프로젝트 ID") { IsRequired = true };
        var nameOpt = new Option<string?>("--name", "이름");
        var descOpt = new Option<string?>("--description", "설명");
        var goalOpt = new Option<string?>("--goal", "목표");
        var statusOpt = new Option<ProjectStatus?>("--status", "Planned|Waiting|InProgress|Done");
        var startOpt = new Option<DateTime?>("--start", "시작일 YYYY-MM-DD");
        var endOpt = new Option<DateTime?>("--end", "종료일 YYYY-MM-DD");
        var budgetOpt = new Option<decimal?>("--budget", "예산");
        var partOpt = new Option<string?>("--participants", "참여자");
        var delivOpt = new Option<string?>("--deliverables", "산출물");
        var linksOpt = new Option<string?>("--links", "관련 링크");

        var c = new Command("update", "프로젝트 부분 갱신 (지정한 옵션만 덮어쓰기)")
        { idOpt, nameOpt, descOpt, goalOpt, statusOpt, startOpt, endOpt, budgetOpt, partOpt, delivOpt, linksOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var id = pr.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<ProjectService>();
            var existing = await svc.GetByIdAsync(id);
            if (existing is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"Project {id} 없음"); return; }
            var dto = new UpdateProjectDto(
                Name: pr.GetValueForOption(nameOpt) ?? existing.Name,
                Description: pr.GetValueForOption(descOpt) ?? existing.Description,
                Goal: pr.GetValueForOption(goalOpt) ?? existing.Goal,
                Status: pr.GetValueForOption(statusOpt) ?? existing.Status,
                StartDate: pr.GetValueForOption(startOpt) ?? existing.StartDate,
                EndDate: pr.GetValueForOption(endOpt) ?? existing.EndDate,
                Budget: pr.GetValueForOption(budgetOpt) ?? existing.Budget,
                Participants: pr.GetValueForOption(partOpt) ?? existing.Participants,
                Deliverables: pr.GetValueForOption(delivOpt) ?? existing.Deliverables,
                RelatedLinks: pr.GetValueForOption(linksOpt) ?? existing.RelatedLinks);
            CliJson.WriteSuccess(await svc.UpdateAsync(id, dto));
        }));
        return c;
    }

    private static Command BuildDelete(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "프로젝트 ID") { IsRequired = true };
        var c = new Command("delete", "프로젝트 삭제 (모든 하위 데이터 cascade)") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<ProjectService>();
            var ok = await svc.DeleteAsync(id);
            if (!ok) { ctx.ExitCode = CliJson.WriteError("not_found", $"Project {id} 없음"); return; }
            CliJson.WriteSuccess(new { deleted = true, id });
        }));
        return c;
    }
}
