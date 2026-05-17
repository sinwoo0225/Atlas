using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Cli.Commands;

internal static class WbsCommands
{
    public static Command Build(IServiceProvider services)
    {
        var cmd = new Command("wbs", "WBS 항목 (list/get/create/update/move/delete)");
        cmd.AddCommand(BuildList(services));
        cmd.AddCommand(BuildGet(services));
        cmd.AddCommand(BuildCreate(services));
        cmd.AddCommand(BuildUpdate(services));
        cmd.AddCommand(BuildMove(services));
        cmd.AddCommand(BuildDelete(services));
        return cmd;
    }

    private static Command BuildList(IServiceProvider services)
    {
        var projOpt = new Option<int>("--project", "프로젝트 ID") { IsRequired = true };
        var verOpt = new Option<int?>("--version", "WBS 버전 ID (없으면 현재 버전)");
        var c = new Command("list", "프로젝트 WBS 트리 조회 (root + children)") { projOpt, verOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pid = ctx.ParseResult.GetValueForOption(projOpt);
            var ver = ctx.ParseResult.GetValueForOption(verOpt);
            var svc = services.GetRequiredService<WbsService>();
            CliJson.WriteSuccess(await svc.GetByProjectAsync(pid, ver));
        }));
        return c;
    }

    private static Command BuildGet(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "WBS 항목 ID") { IsRequired = true };
        var c = new Command("get", "단일 WBS 항목 조회") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<WbsService>();
            var dto = await svc.GetByIdAsync(id);
            if (dto is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"WbsItem {id} 없음"); return; }
            CliJson.WriteSuccess(dto);
        }));
        return c;
    }

    private static Command BuildCreate(IServiceProvider services)
    {
        var projOpt = new Option<int>("--project", "프로젝트 ID") { IsRequired = true };
        var nameOpt = new Option<string>("--name", "이름") { IsRequired = true };
        var parentOpt = new Option<int?>("--parent", "상위 WBS 항목 ID (root 면 생략)");
        var verOpt = new Option<int?>("--version", "WBS 버전 ID");
        var assignOpt = new Option<string?>("--assignee", "담당자 (콤마 구분 가능)");
        var startOpt = new Option<DateTime?>("--start", "시작일 YYYY-MM-DD");
        var endOpt = new Option<DateTime?>("--end", "종료일 YYYY-MM-DD");
        var statusOpt = new Option<WbsStatus?>("--status", "Planned(기본)|InProgress|Done");
        var msOpt = new Option<bool?>("--milestone", "마일스톤 여부");
        var orderOpt = new Option<int?>("--order", "정렬 순서 (기본 0)");
        var notesOpt = new Option<string?>("--notes", "메모");

        var c = new Command("create", "WBS 항목 생성")
        { projOpt, nameOpt, parentOpt, verOpt, assignOpt, startOpt, endOpt, statusOpt, msOpt, orderOpt, notesOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var dto = new CreateWbsItemDto(
                ProjectId: pr.GetValueForOption(projOpt),
                VersionId: pr.GetValueForOption(verOpt),
                ParentId: pr.GetValueForOption(parentOpt),
                Name: pr.GetValueForOption(nameOpt)!,
                Assignee: pr.GetValueForOption(assignOpt) ?? string.Empty,
                StartDate: pr.GetValueForOption(startOpt),
                EndDate: pr.GetValueForOption(endOpt),
                Status: pr.GetValueForOption(statusOpt) ?? WbsStatus.Planned,
                IsMilestone: pr.GetValueForOption(msOpt) ?? false,
                Order: pr.GetValueForOption(orderOpt) ?? 0,
                Notes: pr.GetValueForOption(notesOpt) ?? string.Empty);
            var svc = services.GetRequiredService<WbsService>();
            CliJson.WriteSuccess(await svc.CreateAsync(dto));
        }));
        return c;
    }

    private static Command BuildUpdate(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "WBS 항목 ID") { IsRequired = true };
        var nameOpt = new Option<string?>("--name", "이름");
        var parentOpt = new Option<int?>("--parent", "새 상위 WBS 항목 ID (root 로 옮기려면 wbs move --root)");
        var assignOpt = new Option<string?>("--assignee", "담당자");
        var startOpt = new Option<DateTime?>("--start", "시작일 YYYY-MM-DD");
        var endOpt = new Option<DateTime?>("--end", "종료일 YYYY-MM-DD");
        var statusOpt = new Option<WbsStatus?>("--status", "Planned|InProgress|Done");
        var msOpt = new Option<bool?>("--milestone", "마일스톤 여부");
        var orderOpt = new Option<int?>("--order", "정렬 순서");
        var notesOpt = new Option<string?>("--notes", "메모");

        var c = new Command("update", "WBS 항목 부분 갱신 (지정한 옵션만 덮어쓰기)")
        { idOpt, nameOpt, parentOpt, assignOpt, startOpt, endOpt, statusOpt, msOpt, orderOpt, notesOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var id = pr.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<WbsService>();
            var existing = await svc.GetByIdAsync(id);
            if (existing is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"WbsItem {id} 없음"); return; }
            var dto = new UpdateWbsItemDto(
                ParentId: pr.GetValueForOption(parentOpt) ?? existing.ParentId,
                Name: pr.GetValueForOption(nameOpt) ?? existing.Name,
                Assignee: pr.GetValueForOption(assignOpt) ?? existing.Assignee,
                StartDate: pr.GetValueForOption(startOpt) ?? existing.StartDate,
                EndDate: pr.GetValueForOption(endOpt) ?? existing.EndDate,
                Status: pr.GetValueForOption(statusOpt) ?? existing.Status,
                IsMilestone: pr.GetValueForOption(msOpt) ?? existing.IsMilestone,
                Order: pr.GetValueForOption(orderOpt) ?? existing.Order,
                Notes: pr.GetValueForOption(notesOpt) ?? existing.Notes);
            CliJson.WriteSuccess(await svc.UpdateAsync(id, dto));
        }));
        return c;
    }

    private static Command BuildMove(IServiceProvider services)
    {
        // subtree 이동 단축 — --parent 만 변경. WbsService.UpdateAsync 의 ParentId 변경 시
        // Order 자동 재계산 (사이클 1) + 순환 가드 (자기 자신/자손 부모 지정 거부) 동일하게 적용.
        var idOpt = new Option<int>("--id", "이동할 WBS 항목 ID") { IsRequired = true };
        var parentOpt = new Option<int?>("--parent", "새 상위 ID (생략하면 --root 필요)");
        var rootOpt = new Option<bool>("--root", "root 로 이동 (parent 를 null 로)");
        var c = new Command("move", "WBS subtree 이동 (parent 변경, Order 자동 재계산)")
        { idOpt, parentOpt, rootOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var id = pr.GetValueForOption(idOpt);
            var parent = pr.GetValueForOption(parentOpt);
            var toRoot = pr.GetValueForOption(rootOpt);
            if (parent is null && !toRoot)
            { ctx.ExitCode = CliJson.WriteError("missing_target", "--parent INT 또는 --root 중 하나 필요"); return; }

            var svc = services.GetRequiredService<WbsService>();
            var existing = await svc.GetByIdAsync(id);
            if (existing is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"WbsItem {id} 없음"); return; }
            var dto = new UpdateWbsItemDto(
                ParentId: toRoot ? null : parent,
                Name: existing.Name, Assignee: existing.Assignee,
                StartDate: existing.StartDate, EndDate: existing.EndDate,
                Status: existing.Status, IsMilestone: existing.IsMilestone,
                Order: existing.Order, Notes: existing.Notes);
            CliJson.WriteSuccess(await svc.UpdateAsync(id, dto));
        }));
        return c;
    }

    private static Command BuildDelete(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "WBS 항목 ID") { IsRequired = true };
        var c = new Command("delete", "WBS 항목 삭제 (회의록 ActionItem.promotedWbsItemId 자동 정리)") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<WbsService>();
            var ok = await svc.DeleteAsync(id);
            if (!ok) { ctx.ExitCode = CliJson.WriteError("not_found", $"WbsItem {id} 없음"); return; }
            CliJson.WriteSuccess(new { deleted = true, id });
        }));
        return c;
    }
}
