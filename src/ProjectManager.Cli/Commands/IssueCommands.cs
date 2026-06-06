using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Output;
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
        cmd.AddCommand(BuildWbsLinks(services));
        return cmd;
    }

    private static Command BuildWbsLinks(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "이슈 ID") { IsRequired = true };
        var c = new Command("wbs-links", "이 이슈에 연결된 WBS 항목 목록") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<IssueWbsLinkService>();
            CliJson.WriteSuccess(await svc.GetByIssueAsync(id));
        }));
        return c;
    }

    private static Command BuildList(IServiceProvider services)
    {
        var projOpt = new Option<int>("--project", "프로젝트 ID") { IsRequired = true };
        var statusOpt = CliOptions.EnumList<IssueStatus>("--status", "상태 필터 (다중: Open,InProgress / 반복 가능). 없으면 전부");
        var openOpt = new Option<bool>("--open", "미해결만 (Open|InProgress) — --status 미지정 시 적용");
        var prioOpt = CliOptions.EnumList<IssuePriority>("--priority", "우선순위 필터 (다중: Low,High)");
        var assigneeIdOpt = new Option<int?>("--assignee-id", "담당자 Resource ID (정확 일치)");
        var assigneeOpt = new Option<string?>("--assignee-name", "담당자 이름 부분일치 (정확 ID 는 --assignee-id)");
        var dueFromOpt = new Option<DateTime?>("--due-from", "마감일 >= YYYY-MM-DD");
        var dueToOpt = new Option<DateTime?>("--due-to", "마감일 <= YYYY-MM-DD (해당일 포함)");
        var occFromOpt = new Option<DateTime?>("--occurred-from", "발생일 >= YYYY-MM-DD");
        var occToOpt = new Option<DateTime?>("--occurred-to", "발생일 <= YYYY-MM-DD (해당일 포함)");
        var overdueOpt = new Option<bool>("--overdue", "기한 초과 미완료만 (DueDate < today & 미해결)");
        var keywordOpt = new Option<string?>("--keyword", "제목·설명 부분일치");
        var view = new ListViewOptions();

        var c = new Command("list", "프로젝트 이슈 조회 (필터 + 출력 셰이핑)")
        { projOpt, statusOpt, openOpt, prioOpt, assigneeIdOpt, assigneeOpt,
          dueFromOpt, dueToOpt, occFromOpt, occToOpt, overdueOpt, keywordOpt };
        view.AddTo(c);
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var pid = pr.GetValueForOption(projOpt);
            var statuses = pr.GetValueForOption(statusOpt);
            IReadOnlyList<IssueStatus>? statusFilter =
                statuses is { Length: > 0 } ? statuses
                : (pr.GetValueForOption(openOpt) ? IssueListFilter.OpenStatuses : null);
            var prios = pr.GetValueForOption(prioOpt);
            var filter = new IssueListFilter(
                Statuses: statusFilter,
                Priorities: prios is { Length: > 0 } ? prios : null,
                AssigneeResourceId: pr.GetValueForOption(assigneeIdOpt),
                AssigneeName: pr.GetValueForOption(assigneeOpt),
                DueFrom: pr.GetValueForOption(dueFromOpt),
                DueTo: pr.GetValueForOption(dueToOpt),
                OccurredFrom: pr.GetValueForOption(occFromOpt),
                OccurredTo: pr.GetValueForOption(occToOpt),
                Overdue: pr.GetValueForOption(overdueOpt),
                Keyword: pr.GetValueForOption(keywordOpt));
            var svc = services.GetRequiredService<IssueService>();
            var list = await svc.GetByProjectAsync(pid, filter);
            CliJson.WriteList(list, view.Read(pr, BriefPresets.Issue));
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
        var occurredOpt = new Option<DateTime?>("--occurred", "발생일자 YYYY-MM-DD (이슈가 실제 발생한 시점)");

        var c = new Command("create", "이슈 생성")
        { projOpt, titleOpt, descOpt, statusOpt, prioOpt, assignOpt, dueOpt, occurredOpt };
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
                DueDate: pr.GetValueForOption(dueOpt),
                OccurredOn: pr.GetValueForOption(occurredOpt));
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
        var occurredOpt = new Option<DateTime?>("--occurred", "발생일자 YYYY-MM-DD (이슈가 실제 발생한 시점)");

        var c = new Command("update", "이슈 부분 갱신 (지정한 옵션만 덮어쓰기)")
        { idOpt, titleOpt, descOpt, statusOpt, prioOpt, assignOpt, dueOpt, occurredOpt };
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
                DueDate: pr.GetValueForOption(dueOpt) ?? existing.DueDate,
                OccurredOn: pr.GetValueForOption(occurredOpt) ?? existing.OccurredOn);
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
