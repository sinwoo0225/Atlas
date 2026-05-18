using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Services;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Cli.Commands;

internal static class WorkLogCommands
{
    // 각 필드 (Done/Plan/Issues) 가 multiline markdown 일 수 있어 file/stdin 옵션 제공.
    // PowerShell 5.1 native call 큰따옴표 strip 회피 — file/stdin 안전.
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
        var cmd = new Command("worklog", "업무일지 (week/upsert) — ProjectId+Date 가 유일키. delete 는 없음 (도메인 정책)");
        cmd.AddCommand(BuildWeek(services));
        cmd.AddCommand(BuildUpsert(services));
        return cmd;
    }

    private static Command BuildWeek(IServiceProvider services)
    {
        var projOpt = new Option<int>("--project", "프로젝트 ID") { IsRequired = true };
        var weekOpt = new Option<DateTime?>("--week-start", "주 시작일 YYYY-MM-DD (생략 시 오늘 기준 — 서비스가 Monday 보정)");
        var c = new Command("week", "주간 업무일지 조회 (Monday 시작 7 일)") { projOpt, weekOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pid = ctx.ParseResult.GetValueForOption(projOpt);
            var week = ctx.ParseResult.GetValueForOption(weekOpt) ?? DateTime.Today;
            var svc = services.GetRequiredService<WorkLogService>();
            CliJson.WriteSuccess(await svc.GetWeekAsync(pid, week));
        }));
        return c;
    }

    private static Command BuildUpsert(IServiceProvider services)
    {
        var projOpt = new Option<int>("--project", "프로젝트 ID") { IsRequired = true };
        var dateOpt = new Option<DateTime>("--date", "날짜 YYYY-MM-DD") { IsRequired = true };
        var doneOpt = new Option<string?>("--done", "완료 (markdown)");
        var doneFileOpt = new Option<string?>("--done-file", "완료를 파일/stdin('-') 에서 읽기 — --done 보다 우선");
        var planOpt = new Option<string?>("--plan", "계획 (markdown)");
        var planFileOpt = new Option<string?>("--plan-file", "계획을 파일/stdin('-') 에서 읽기 — --plan 보다 우선");
        var issuesOpt = new Option<string?>("--issues", "이슈 (markdown)");
        var issuesFileOpt = new Option<string?>("--issues-file", "이슈를 파일/stdin('-') 에서 읽기 — --issues 보다 우선");

        var c = new Command("upsert", "해당 일자의 업무일지 upsert (없으면 생성, 있으면 덮어쓰기)")
        { projOpt, dateOpt, doneOpt, doneFileOpt, planOpt, planFileOpt, issuesOpt, issuesFileOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var done = await ResolveAsync(pr.GetValueForOption(doneFileOpt), pr.GetValueForOption(doneOpt)) ?? string.Empty;
            var plan = await ResolveAsync(pr.GetValueForOption(planFileOpt), pr.GetValueForOption(planOpt)) ?? string.Empty;
            var issues = await ResolveAsync(pr.GetValueForOption(issuesFileOpt), pr.GetValueForOption(issuesOpt)) ?? string.Empty;
            var svc = services.GetRequiredService<WorkLogService>();
            CliJson.WriteSuccess(await svc.UpsertAsync(
                pr.GetValueForOption(projOpt),
                pr.GetValueForOption(dateOpt),
                new UpsertWorkLogDto(done, plan, issues)));
        }));
        return c;
    }
}
