using System.CommandLine;
using System.Text.Json.Nodes;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Cli.Commands;

internal static class MeetingCommands
{
    // 회의 구분 파싱 — internal/external 대소문자 무시, 미지정/오타면 fallback.
    private static MeetingCategory ParseCategory(string? raw, MeetingCategory fallback) =>
        Enum.TryParse<MeetingCategory>(raw, ignoreCase: true, out var v) ? v : fallback;

    // ActionItems 는 DB 저장 형식이 JSON-in-TEXT(string). CLI 응답에서는 객체로 풀어
    // 자동화 측이 한 번 더 ConvertFrom-Json 해야 하는 번거로움을 피한다. 비-JSON 이면 원본 string 그대로.
    private static JsonNode? TryParseJson(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        try { return JsonNode.Parse(raw); }
        catch { return JsonValue.Create(raw); }
    }

    // ActionItems 입력 해석 — file/stdin 우선, 없으면 인라인 인자, 모두 null 이면 fallback.
    // PowerShell 5.1 의 native call 큰따옴표 strip 함정 회피 (file/stdin 은 안전).
    private static async Task<string> ResolveActionItemsAsync(
        string? filePath, string? inline, string fallback)
    {
        if (!string.IsNullOrEmpty(filePath))
        {
            var raw = filePath == "-"
                ? await Console.In.ReadToEndAsync()
                : await File.ReadAllTextAsync(filePath);
            // BOM (U+FEFF) 제거 + 좌우 공백/개행 trim.
            // PowerShell 의 $OutputEncoding=UTF8 / Out-File -Encoding utf8 가 BOM 을 추가하기 때문.
            return raw.Trim('﻿', ' ', '\r', '\n', '\t');
        }
        return inline ?? fallback;
    }

    private static object Project(MeetingDto m) => new
    {
        m.Id, m.ProjectId, m.Date, m.StartTime, m.EndTime, m.Category, m.Attendees, m.Topic,
        m.Decisions, m.Discussion,
        ActionItems = TryParseJson(m.ActionItems),
        m.MarkdownPath, m.CreatedAt, m.UpdatedAt,
    };

    public static Command Build(IServiceProvider services)
    {
        var cmd = new Command("meeting", "회의록 (list/get/create/update/delete)");
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
        var kwOpt = new Option<string?>("--keyword", "제목/내용 키워드 (없으면 전부)");
        var catOpt = new Option<string?>("--category", "구분 필터: internal | external (없으면 전부)");
        var c = new Command("list", "프로젝트 회의록 조회") { projOpt, kwOpt, catOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pid = ctx.ParseResult.GetValueForOption(projOpt);
            var kw = ctx.ParseResult.GetValueForOption(kwOpt);
            var catRaw = ctx.ParseResult.GetValueForOption(catOpt);
            var svc = services.GetRequiredService<MeetingService>();
            var list = await svc.GetByProjectAsync(pid, kw);
            if (!string.IsNullOrWhiteSpace(catRaw) && Enum.TryParse<MeetingCategory>(catRaw, ignoreCase: true, out var cat))
                list = list.Where(m => m.Category == cat);
            CliJson.WriteSuccess(list.Select(Project));
        }));
        return c;
    }

    private static Command BuildGet(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "회의록 ID") { IsRequired = true };
        var c = new Command("get", "단일 회의록 조회") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<MeetingService>();
            var dto = await svc.GetByIdAsync(id);
            if (dto is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"Meeting {id} 없음"); return; }
            CliJson.WriteSuccess(Project(dto));
        }));
        return c;
    }

    private static Command BuildCreate(IServiceProvider services)
    {
        var projOpt = new Option<int>("--project", "프로젝트 ID") { IsRequired = true };
        var dateOpt = new Option<DateTime>("--date", "회의 날짜 YYYY-MM-DD") { IsRequired = true };
        var startOpt = new Option<string?>("--start", "시작 시각 HH:mm");
        var endOpt = new Option<string?>("--end", "종료 시각 HH:mm");
        var attendOpt = new Option<string?>("--attendees", "참석자 (자유 형식: \"a, b, c\")");
        var catOpt = new Option<string?>("--category", "회의 구분: internal(기본) | external");
        var topicOpt = new Option<string>("--topic", "주제") { IsRequired = true };
        var decisOpt = new Option<string?>("--decisions", "결정 사항 (markdown)");
        var discOpt = new Option<string?>("--discussion", "논의 내용 (markdown)");
        // ActionItems 는 JSON 배열 그대로. 예: '[{"id":"a1","content":"X 처리","assignee":"홍길동"}]'.
        // 빈 값이면 빈 배열 '[]' 로 저장 — 회의록 폼이 빈 ActionItems 도 정상 처리.
        var aiOpt = new Option<string?>("--action-items",
            "ActionItem JSON 배열 인라인 (PowerShell escape 함정 — 가능하면 --action-items-file 사용)");
        var aiFileOpt = new Option<string?>("--action-items-file",
            "ActionItem JSON 을 파일에서 읽기. '-' 이면 stdin. --action-items 보다 우선.");

        var c = new Command("create", "회의록 생성 (저장 시 md 파일 자동 export)")
        { projOpt, dateOpt, startOpt, endOpt, attendOpt, catOpt, topicOpt, decisOpt, discOpt, aiOpt, aiFileOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var actionItems = await ResolveActionItemsAsync(
                pr.GetValueForOption(aiFileOpt), pr.GetValueForOption(aiOpt), "[]");
            var dto = new CreateMeetingDto(
                ProjectId: pr.GetValueForOption(projOpt),
                Date: pr.GetValueForOption(dateOpt),
                StartTime: pr.GetValueForOption(startOpt),
                EndTime: pr.GetValueForOption(endOpt),
                Category: ParseCategory(pr.GetValueForOption(catOpt), MeetingCategory.Internal),
                Attendees: pr.GetValueForOption(attendOpt) ?? string.Empty,
                Topic: pr.GetValueForOption(topicOpt)!,
                Decisions: pr.GetValueForOption(decisOpt) ?? string.Empty,
                Discussion: pr.GetValueForOption(discOpt) ?? string.Empty,
                ActionItems: actionItems);
            var svc = services.GetRequiredService<MeetingService>();
            CliJson.WriteSuccess(Project(await svc.CreateAsync(dto)));
        }));
        return c;
    }

    private static Command BuildUpdate(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "회의록 ID") { IsRequired = true };
        var dateOpt = new Option<DateTime?>("--date", "회의 날짜 YYYY-MM-DD");
        var startOpt = new Option<string?>("--start", "시작 시각 HH:mm");
        var endOpt = new Option<string?>("--end", "종료 시각 HH:mm");
        var attendOpt = new Option<string?>("--attendees", "참석자");
        var catOpt = new Option<string?>("--category", "회의 구분: internal | external (미지정 시 기존 값 유지)");
        var topicOpt = new Option<string?>("--topic", "주제");
        var decisOpt = new Option<string?>("--decisions", "결정 사항 (markdown)");
        var discOpt = new Option<string?>("--discussion", "논의 내용 (markdown)");
        var aiOpt = new Option<string?>("--action-items", "ActionItem JSON 배열 인라인");
        var aiFileOpt = new Option<string?>("--action-items-file",
            "ActionItem JSON 파일/stdin('-'). --action-items 보다 우선. 둘 다 미지정 시 기존 값 유지.");

        var c = new Command("update", "회의록 부분 갱신 (지정한 옵션만 덮어쓰기)")
        { idOpt, dateOpt, startOpt, endOpt, attendOpt, catOpt, topicOpt, decisOpt, discOpt, aiOpt, aiFileOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var id = pr.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<MeetingService>();
            var existing = await svc.GetByIdAsync(id);
            if (existing is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"Meeting {id} 없음"); return; }
            var actionItems = await ResolveActionItemsAsync(
                pr.GetValueForOption(aiFileOpt), pr.GetValueForOption(aiOpt), existing.ActionItems);
            var dto = new UpdateMeetingDto(
                Date: pr.GetValueForOption(dateOpt) ?? existing.Date,
                StartTime: pr.GetValueForOption(startOpt) ?? existing.StartTime,
                EndTime: pr.GetValueForOption(endOpt) ?? existing.EndTime,
                Category: ParseCategory(pr.GetValueForOption(catOpt), existing.Category),
                Attendees: pr.GetValueForOption(attendOpt) ?? existing.Attendees,
                Topic: pr.GetValueForOption(topicOpt) ?? existing.Topic,
                Decisions: pr.GetValueForOption(decisOpt) ?? existing.Decisions,
                Discussion: pr.GetValueForOption(discOpt) ?? existing.Discussion,
                ActionItems: actionItems,
                UpdatedAt: existing.UpdatedAt);
            var updated = await svc.UpdateAsync(id, dto);
            if (updated is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"Meeting {id} 없음"); return; }
            CliJson.WriteSuccess(Project(updated));
        }));
        return c;
    }

    private static Command BuildDelete(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "회의록 ID") { IsRequired = true };
        var c = new Command("delete", "회의록 삭제 (md 파일도 같이 제거)") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<MeetingService>();
            var ok = await svc.DeleteAsync(id);
            if (!ok) { ctx.ExitCode = CliJson.WriteError("not_found", $"Meeting {id} 없음"); return; }
            CliJson.WriteSuccess(new { deleted = true, id });
        }));
        return c;
    }
}
