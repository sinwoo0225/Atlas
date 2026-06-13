using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Cli.Commands;

internal static class TodoCommands
{
    public static Command Build(IServiceProvider services)
    {
        // 독립 TODO(프로젝트 무관) + 통합 '내 업무(my-work)' 조회.
        var cmd = new Command("todo", "독립 TODO (list/get/create/update/complete/delete) + my-work 통합 조회");
        cmd.AddCommand(BuildList(services));
        cmd.AddCommand(BuildGet(services));
        cmd.AddCommand(BuildCreate(services));
        cmd.AddCommand(BuildUpdate(services));
        cmd.AddCommand(BuildComplete(services));
        cmd.AddCommand(BuildDelete(services));
        cmd.AddCommand(BuildMyWork(services));
        return cmd;
    }

    private static Command BuildList(IServiceProvider services)
    {
        var openOpt = new Option<bool>("--open", "미완(Open)만");
        var assigneeOpt = new Option<int?>("--assignee", "담당자 Resource ID");
        var keywordOpt = new Option<string?>("--keyword", "제목·메모 부분일치");
        var c = new Command("list", "독립 TODO 조회") { openOpt, assigneeOpt, keywordOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var filter = new TodoListFilter(
                Open: pr.GetValueForOption(openOpt),
                AssigneeResourceId: pr.GetValueForOption(assigneeOpt),
                Keyword: pr.GetValueForOption(keywordOpt));
            var svc = services.GetRequiredService<TodoService>();
            CliJson.WriteSuccess(await svc.GetAllAsync(filter));
        }));
        return c;
    }

    private static Command BuildGet(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "TODO ID") { IsRequired = true };
        var c = new Command("get", "단일 TODO 조회") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<TodoService>();
            var dto = await svc.GetByIdAsync(id);
            if (dto is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"Todo {id} 없음"); return; }
            CliJson.WriteSuccess(dto);
        }));
        return c;
    }

    private static Command BuildCreate(IServiceProvider services)
    {
        var titleOpt = new Option<string>("--title", "제목") { IsRequired = true };
        var notesOpt = new Option<string?>("--notes", "메모");
        var assigneeOpt = new Option<int?>("--assignee", "담당자 Resource ID");
        var dueOpt = new Option<DateTime?>("--due", "마감일 YYYY-MM-DD");
        var statusOpt = new Option<TodoStatus?>("--status", "Open(기본)|Done");
        var recurOpt = new Option<TodoRecurrence?>("--recurrence", "None(기본)|Daily|Weekly|Monthly|Yearly");
        var intervalOpt = new Option<int?>("--interval", "반복 간격(N 주기마다, 기본 1)");

        var c = new Command("create", "독립 TODO 생성")
        { titleOpt, notesOpt, assigneeOpt, dueOpt, statusOpt, recurOpt, intervalOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var dto = new CreateTodoItemDto(
                Title: pr.GetValueForOption(titleOpt)!,
                Notes: pr.GetValueForOption(notesOpt) ?? string.Empty,
                AssigneeResourceId: pr.GetValueForOption(assigneeOpt),
                DueDate: pr.GetValueForOption(dueOpt),
                Status: pr.GetValueForOption(statusOpt) ?? TodoStatus.Open,
                Recurrence: pr.GetValueForOption(recurOpt) ?? TodoRecurrence.None,
                RecurrenceInterval: pr.GetValueForOption(intervalOpt) ?? 1);
            var svc = services.GetRequiredService<TodoService>();
            CliJson.WriteSuccess(await svc.CreateAsync(dto));
        }));
        return c;
    }

    private static Command BuildUpdate(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "TODO ID") { IsRequired = true };
        var titleOpt = new Option<string?>("--title", "제목");
        var notesOpt = new Option<string?>("--notes", "메모");
        var assigneeOpt = new Option<int?>("--assignee", "담당자 Resource ID");
        var dueOpt = new Option<DateTime?>("--due", "마감일 YYYY-MM-DD");
        var statusOpt = new Option<TodoStatus?>("--status", "Open|Done");
        var completedOpt = new Option<DateTime?>("--completed", "완료일(실적) YYYY-MM-DD");
        var recurOpt = new Option<TodoRecurrence?>("--recurrence", "None|Daily|Weekly|Monthly|Yearly");
        var intervalOpt = new Option<int?>("--interval", "반복 간격(N 주기마다)");
        var sortOpt = new Option<int?>("--sort-order", "정렬 위치");

        var c = new Command("update", "TODO 부분 갱신 (지정한 옵션만 덮어쓰기)")
        { idOpt, titleOpt, notesOpt, assigneeOpt, dueOpt, statusOpt, completedOpt, recurOpt, intervalOpt, sortOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var id = pr.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<TodoService>();
            var existing = await svc.GetByIdAsync(id);
            if (existing is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"Todo {id} 없음"); return; }
            var dto = new UpdateTodoItemDto(
                Title: pr.GetValueForOption(titleOpt) ?? existing.Title,
                Notes: pr.GetValueForOption(notesOpt) ?? existing.Notes,
                AssigneeResourceId: pr.GetValueForOption(assigneeOpt) ?? existing.AssigneeResourceId,
                DueDate: pr.GetValueForOption(dueOpt) ?? existing.DueDate,
                Status: pr.GetValueForOption(statusOpt) ?? existing.Status,
                CompletedDate: pr.GetValueForOption(completedOpt) ?? existing.CompletedDate,
                Recurrence: pr.GetValueForOption(recurOpt) ?? existing.Recurrence,
                RecurrenceInterval: pr.GetValueForOption(intervalOpt) ?? existing.RecurrenceInterval,
                SortOrder: pr.GetValueForOption(sortOpt) ?? existing.SortOrder,
                UpdatedAt: existing.UpdatedAt);
            CliJson.WriteSuccess(await svc.UpdateAsync(id, dto));
        }));
        return c;
    }

    private static Command BuildComplete(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "TODO ID") { IsRequired = true };
        var c = new Command("complete", "TODO 완료 처리 (반복이면 다음 회차 자동 생성)") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<TodoService>();
            if (!await svc.CompleteAsync(id)) { ctx.ExitCode = CliJson.WriteError("not_found", $"Todo {id} 없음"); return; }
            CliJson.WriteSuccess(new { completed = true, id });
        }));
        return c;
    }

    private static Command BuildDelete(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "TODO ID") { IsRequired = true };
        var c = new Command("delete", "TODO 삭제") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<TodoService>();
            if (!await svc.DeleteAsync(id)) { ctx.ExitCode = CliJson.WriteError("not_found", $"Todo {id} 없음"); return; }
            CliJson.WriteSuccess(new { deleted = true, id });
        }));
        return c;
    }

    private static Command BuildMyWork(IServiceProvider services)
    {
        var assigneeOpt = new Option<int?>("--assignee", "담당자 Resource ID (생략 시 전체)");
        var c = new Command("my-work", "내게 할당된 미완 WBS + 미해결 이슈 + 미완 독립 TODO 통합 조회") { assigneeOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var assignee = ctx.ParseResult.GetValueForOption(assigneeOpt);
            var svc = services.GetRequiredService<TodoService>();
            CliJson.WriteSuccess(await svc.GetMyWorkAsync(assignee));
        }));
        return c;
    }
}
