using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Cli.Commands;

internal static class IssueCommands
{
    public static Command Build(IServiceProvider services)
    {
        var cmd = new Command("issue", "이슈 (list/get/create/update/delete)");
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
        var statusOpt = new Option<IssueStatus?>("--status", "Open|InProgress|Resolved|Closed (없으면 전부)");
        var c = new Command("list", "프로젝트 이슈 조회 (옵션 --status 로 필터)") { projOpt, statusOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pid = ctx.ParseResult.GetValueForOption(projOpt);
            var status = ctx.ParseResult.GetValueForOption(statusOpt);
            var svc = services.GetRequiredService<IssueService>();
            var list = await svc.GetByProjectAsync(pid);
            if (status is not null) list = list.Where(i => i.Status == status.Value);
            CliJson.WriteSuccess(list);
        }));
        return c;
    }

    private static Command BuildGet(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "이슈 ID") { IsRequired = true };
        var c = new Command("get", "단일 이슈 조회") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<IssueService>();
            var dto = await svc.GetByIdAsync(id);
            if (dto is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"Issue {id} 없음"); return; }
            CliJson.WriteSuccess(dto);
        }));
        return c;
    }

    private static Command BuildCreate(IServiceProvider services)
    {
        var projOpt = new Option<int>("--project", "프로젝트 ID") { IsRequired = true };
        var titleOpt = new Option<string>("--title", "제목") { IsRequired = true };
        var descOpt = new Option<string?>("--description", "설명");
        var statusOpt = new Option<IssueStatus?>("--status", "Open(기본)|InProgress|Resolved|Closed");
        var prioOpt = new Option<IssuePriority?>("--priority", "Low|Medium(기본)|High");
        var assignOpt = new Option<int?>("--assignee", "Resource ID (담당자)");
        var dueOpt = new Option<DateTime?>("--due", "마감일 YYYY-MM-DD");

        var c = new Command("create", "이슈 생성")
        { projOpt, titleOpt, descOpt, statusOpt, prioOpt, assignOpt, dueOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var dto = new CreateIssueDto(
                ProjectId: pr.GetValueForOption(projOpt),
                Title: pr.GetValueForOption(titleOpt)!,
                Description: pr.GetValueForOption(descOpt) ?? string.Empty,
                Status: pr.GetValueForOption(statusOpt) ?? IssueStatus.Open,
                Priority: pr.GetValueForOption(prioOpt) ?? IssuePriority.Medium,
                AssigneeResourceId: pr.GetValueForOption(assignOpt),
                DueDate: pr.GetValueForOption(dueOpt));
            var svc = services.GetRequiredService<IssueService>();
            CliJson.WriteSuccess(await svc.CreateAsync(dto));
        }));
        return c;
    }

    private static Command BuildUpdate(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "이슈 ID") { IsRequired = true };
        var titleOpt = new Option<string?>("--title", "제목");
        var descOpt = new Option<string?>("--description", "설명");
        var statusOpt = new Option<IssueStatus?>("--status", "Open|InProgress|Resolved|Closed");
        var prioOpt = new Option<IssuePriority?>("--priority", "Low|Medium|High");
        var assignOpt = new Option<int?>("--assignee", "Resource ID (담당자)");
        var dueOpt = new Option<DateTime?>("--due", "마감일 YYYY-MM-DD");

        var c = new Command("update", "이슈 부분 갱신 (지정한 옵션만 덮어쓰기)")
        { idOpt, titleOpt, descOpt, statusOpt, prioOpt, assignOpt, dueOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var id = pr.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<IssueService>();
            var existing = await svc.GetByIdAsync(id);
            if (existing is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"Issue {id} 없음"); return; }
            var dto = new UpdateIssueDto(
                Title: pr.GetValueForOption(titleOpt) ?? existing.Title,
                Description: pr.GetValueForOption(descOpt) ?? existing.Description,
                Status: pr.GetValueForOption(statusOpt) ?? existing.Status,
                Priority: pr.GetValueForOption(prioOpt) ?? existing.Priority,
                AssigneeResourceId: pr.GetValueForOption(assignOpt) ?? existing.AssigneeResourceId,
                DueDate: pr.GetValueForOption(dueOpt) ?? existing.DueDate);
            CliJson.WriteSuccess(await svc.UpdateAsync(id, dto));
        }));
        return c;
    }

    private static Command BuildDelete(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "이슈 ID") { IsRequired = true };
        var c = new Command("delete", "이슈 삭제 (회의록 ActionItem.promotedIssueId 자동 정리)") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<IssueService>();
            var ok = await svc.DeleteAsync(id);
            if (!ok) { ctx.ExitCode = CliJson.WriteError("not_found", $"Issue {id} 없음"); return; }
            CliJson.WriteSuccess(new { deleted = true, id });
        }));
        return c;
    }
}
