using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Output;
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
        cmd.AddCommand(BuildContext(services));
        // 연결(관련 정보/이슈) 조회·관리
        cmd.AddCommand(BuildDevInfoLinks(services));
        cmd.AddCommand(BuildIssueLinks(services));
        cmd.AddCommand(BuildLinkDevInfo(services));
        cmd.AddCommand(BuildUnlinkDevInfo(services));
        cmd.AddCommand(BuildLinkIssue(services));
        cmd.AddCommand(BuildUnlinkIssue(services));
        return cmd;
    }

    private static Command BuildList(IServiceProvider services)
    {
        var projOpt = new Option<int>("--project", "프로젝트 ID") { IsRequired = true };
        var verOpt = new Option<int?>("--version", "WBS 버전 ID (없으면 현재 버전)");
        var statusOpt = CliOptions.EnumList<WbsStatus>("--status", "상태 필터 (다중: Planned,InProgress / 반복 가능)");
        var openOpt = new Option<bool>("--open", "미완만 (Planned|InProgress) — --status 미지정 시 적용");
        var activeOnOpt = CliOptions.DateOrKeyword("--active-on", "그 날 진행 중 (시작<=날짜<=종료). today|now 또는 YYYY-MM-DD");
        var startFromOpt = new Option<DateTime?>("--start-from", "시작일 >= YYYY-MM-DD");
        var startToOpt = new Option<DateTime?>("--start-to", "시작일 <= YYYY-MM-DD (해당일 포함)");
        var endFromOpt = new Option<DateTime?>("--end-from", "종료일 >= YYYY-MM-DD");
        var endToOpt = new Option<DateTime?>("--end-to", "종료일 <= YYYY-MM-DD (해당일 포함)");
        var assigneeOpt = new Option<string?>("--assignee", "담당자 부분일치 (자유 문자열)");
        var milestoneOpt = new Option<bool?>("--milestone", "마일스톤만(true)/마일스톤 제외(false)");
        var keywordOpt = new Option<string?>("--keyword", "이름·메모 부분일치");
        var view = new ListViewOptions();

        var c = new Command("list",
            "프로젝트 WBS 조회. 필터/셰이핑 없으면 트리(root+children), 있으면 평면 리스트(ParentId 포함)")
        { projOpt, verOpt, statusOpt, openOpt, activeOnOpt, startFromOpt, startToOpt,
          endFromOpt, endToOpt, assigneeOpt, milestoneOpt, keywordOpt };
        view.AddTo(c);
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var pid = pr.GetValueForOption(projOpt);
            var ver = pr.GetValueForOption(verOpt);
            var statuses = pr.GetValueForOption(statusOpt);
            IReadOnlyList<WbsStatus>? statusFilter =
                statuses is { Length: > 0 } ? statuses
                : (pr.GetValueForOption(openOpt) ? WbsListFilter.OpenStatuses : null);
            var filter = new WbsListFilter(
                Statuses: statusFilter,
                ActiveOn: pr.GetValueForOption(activeOnOpt),
                StartFrom: pr.GetValueForOption(startFromOpt),
                StartTo: pr.GetValueForOption(startToOpt),
                EndFrom: pr.GetValueForOption(endFromOpt),
                EndTo: pr.GetValueForOption(endToOpt),
                Assignee: pr.GetValueForOption(assigneeOpt),
                Milestone: pr.GetValueForOption(milestoneOpt),
                Keyword: pr.GetValueForOption(keywordOpt));
            var listView = view.Read(pr, BriefPresets.Wbs);
            var shaped = listView.Count || listView.Limit is not null || listView.Fields is { Count: > 0 };

            var svc = services.GetRequiredService<WbsService>();
            // 필터·셰이핑이 있으면 평면(트리로 묶으면 매칭 하위 소실), 없으면 기존 트리 그대로.
            if (!filter.IsEmpty || shaped)
                CliJson.WriteList(await svc.QueryAsync(pid, ver, filter), listView);
            else
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
        var importanceOpt = new Option<int?>("--importance", "중요도 1=낮음 / 2=중간 (기본) / 3=높음");
        importanceOpt.AddAlias("--order"); // 사이클 13 사용자 호환 (옛 --order = 중요도 의미)
        var notesOpt = new Option<string?>("--notes", "메모");

        var c = new Command("create", "WBS 항목 생성 (SortOrder 는 시작일 그룹 끝에 자동 추가)")
        { projOpt, nameOpt, parentOpt, verOpt, assignOpt, startOpt, endOpt, statusOpt, msOpt, importanceOpt, notesOpt };
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
                Importance: pr.GetValueForOption(importanceOpt) ?? 2,
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
        var importanceOpt = new Option<int?>("--importance", "중요도 1=낮음 / 2=중간 / 3=높음");
        importanceOpt.AddAlias("--order"); // 사이클 13 사용자 호환
        var sortOrderOpt = new Option<int?>("--sort-order", "정렬 위치 (드물게 수동, 보통 dnd-kit reorder 사용)");
        var notesOpt = new Option<string?>("--notes", "메모");

        var c = new Command("update", "WBS 항목 부분 갱신 (지정한 옵션만 덮어쓰기)")
        { idOpt, nameOpt, parentOpt, assignOpt, startOpt, endOpt, statusOpt, msOpt, importanceOpt, sortOrderOpt, notesOpt };
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
                Importance: pr.GetValueForOption(importanceOpt) ?? existing.Importance,
                Notes: pr.GetValueForOption(notesOpt) ?? existing.Notes,
                SortOrder: pr.GetValueForOption(sortOrderOpt) ?? existing.SortOrder,
                UpdatedAt: existing.UpdatedAt);
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
                Importance: existing.Importance, Notes: existing.Notes,
                SortOrder: existing.SortOrder, // parentChanged 분기라 백엔드가 덮어씀
                UpdatedAt: existing.UpdatedAt);
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

    private static Command BuildContext(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "WBS 항목 ID") { IsRequired = true };
        var noChildren = new Option<bool>("--no-children", "하위 작업 제외");
        var noDevInfo = new Option<bool>("--no-devinfo", "연결된 업무 정보 제외");
        var noIssues = new Option<bool>("--no-issues", "연결된 이슈 제외");
        var noChangelogs = new Option<bool>("--no-changelogs", "출처 변경이력 제외");
        var c = new Command("context",
            "작업 한 건의 종합 컨텍스트 한 방 조회 — 본문·Notes + 하위 + 연결 업무정보(깃 경로·스펙 포함) + 연결 이슈 + 출처 변경이력")
        { idOpt, noChildren, noDevInfo, noIssues, noChangelogs };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var id = pr.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<WbsContextService>();
            var bundle = await svc.GetContextAsync(id,
                includeChildren: !pr.GetValueForOption(noChildren),
                includeDevInfo: !pr.GetValueForOption(noDevInfo),
                includeIssues: !pr.GetValueForOption(noIssues),
                includeChangeLogs: !pr.GetValueForOption(noChangelogs));
            if (bundle is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"WbsItem {id} 없음"); return; }
            CliJson.WriteSuccess(bundle);
        }));
        return c;
    }

    // --- 연결(관련 정보/이슈) ---

    private static Command BuildDevInfoLinks(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "WBS 항목 ID") { IsRequired = true };
        var c = new Command("devinfo-links", "이 WBS 항목에 연결된 업무 정보(관련 정보) 목록") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<WbsDevInfoLinkService>();
            CliJson.WriteSuccess(await svc.GetByWbsItemAsync(id));
        }));
        return c;
    }

    private static Command BuildIssueLinks(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "WBS 항목 ID") { IsRequired = true };
        var c = new Command("issue-links", "이 WBS 항목에 연결된 이슈 목록") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<IssueWbsLinkService>();
            CliJson.WriteSuccess(await svc.GetByWbsItemAsync(id));
        }));
        return c;
    }

    private static Command BuildLinkDevInfo(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "WBS 항목 ID") { IsRequired = true };
        var devOpt = new Option<int>("--devinfo", "업무 정보(DevInfo) ID") { IsRequired = true };
        var c = new Command("link-devinfo", "WBS 항목에 업무 정보 연결 (같은 프로젝트, 중복 불가)") { idOpt, devOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var dev = ctx.ParseResult.GetValueForOption(devOpt);
            var svc = services.GetRequiredService<WbsDevInfoLinkService>();
            try { CliJson.WriteSuccess(await svc.CreateAsync(new CreateWbsDevInfoLinkDto(id, dev))); }
            catch (WbsDevInfoLinkConflictException ex) { ctx.ExitCode = CliJson.WriteError("bad_request", ex.Message); }
        }));
        return c;
    }

    private static Command BuildUnlinkDevInfo(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "WBS 항목 ID") { IsRequired = true };
        var devOpt = new Option<int>("--devinfo", "업무 정보(DevInfo) ID") { IsRequired = true };
        var c = new Command("unlink-devinfo", "WBS ↔ 업무 정보 연결 해제") { idOpt, devOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var dev = ctx.ParseResult.GetValueForOption(devOpt);
            var svc = services.GetRequiredService<WbsDevInfoLinkService>();
            if (!await svc.DeleteAsync(id, dev))
            { ctx.ExitCode = CliJson.WriteError("not_found", $"연결 없음 (wbs {id} ↔ devinfo {dev})"); return; }
            CliJson.WriteSuccess(new { unlinked = true, wbsItemId = id, devInfoItemId = dev });
        }));
        return c;
    }

    private static Command BuildLinkIssue(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "WBS 항목 ID") { IsRequired = true };
        var issueOpt = new Option<int>("--issue", "이슈 ID") { IsRequired = true };
        var typeOpt = new Option<IssueWbsLinkType?>("--type", "관계 유형 RelatesTo(기본)|Blocks|ParentOf");
        var c = new Command("link-issue", "WBS 항목에 이슈 연결 (같은 프로젝트, 중복 불가)") { idOpt, issueOpt, typeOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var id = pr.GetValueForOption(idOpt);
            var issue = pr.GetValueForOption(issueOpt);
            var type = pr.GetValueForOption(typeOpt) ?? IssueWbsLinkType.RelatesTo;
            var svc = services.GetRequiredService<IssueWbsLinkService>();
            try { CliJson.WriteSuccess(await svc.CreateAsync(new CreateIssueWbsLinkDto(issue, id, type))); }
            catch (IssueWbsLinkConflictException ex) { ctx.ExitCode = CliJson.WriteError("bad_request", ex.Message); }
        }));
        return c;
    }

    private static Command BuildUnlinkIssue(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "WBS 항목 ID") { IsRequired = true };
        var issueOpt = new Option<int>("--issue", "이슈 ID") { IsRequired = true };
        var c = new Command("unlink-issue", "WBS ↔ 이슈 연결 해제") { idOpt, issueOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var issue = ctx.ParseResult.GetValueForOption(issueOpt);
            var svc = services.GetRequiredService<IssueWbsLinkService>();
            if (!await svc.DeleteAsync(issue, id))
            { ctx.ExitCode = CliJson.WriteError("not_found", $"연결 없음 (issue {issue} ↔ wbs {id})"); return; }
            CliJson.WriteSuccess(new { unlinked = true, wbsItemId = id, issueId = issue });
        }));
        return c;
    }
}
