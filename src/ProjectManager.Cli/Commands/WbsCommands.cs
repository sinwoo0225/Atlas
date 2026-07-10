using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Output;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

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
        // 경량 체크리스트(서브태스크)
        cmd.AddCommand(BuildSubtask(services));
        // 자원 배정/배분 (자유텍스트 Assignee 와 동기화되는 구조화 배정)
        cmd.AddCommand(BuildAssign(services));
        cmd.AddCommand(BuildUnassign(services));
        cmd.AddCommand(BuildAssignments(services));
        cmd.AddCommand(BuildBackfillAssignments(services));
        // 일정 지능 — 의존성·임계경로·자동 리스케줄
        cmd.AddCommand(BuildLinkDep(services));
        cmd.AddCommand(BuildUnlinkDep(services));
        cmd.AddCommand(BuildDeps(services));
        cmd.AddCommand(BuildCriticalPath(services));
        cmd.AddCommand(BuildReschedule(services));
        cmd.AddCommand(BuildBaseline(services));
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
        var openOpt = new Option<bool>("--open", "미완만 (Planned|Waiting|InProgress) — --status 미지정 시 적용");
        var activeOnOpt = CliOptions.DateOrKeyword("--active-on", "그 날 진행 중 (시작<=날짜<=종료). today|now 또는 YYYY-MM-DD");
        var startFromOpt = new Option<DateTime?>("--start-from", "시작일 >= YYYY-MM-DD");
        var startToOpt = new Option<DateTime?>("--start-to", "시작일 <= YYYY-MM-DD (해당일 포함)");
        var endFromOpt = new Option<DateTime?>("--end-from", "종료일 >= YYYY-MM-DD");
        var endToOpt = new Option<DateTime?>("--end-to", "종료일 <= YYYY-MM-DD (해당일 포함)");
        var assigneeOpt = new Option<string?>("--assignee", "담당자 부분일치 (자유 문자열)");
        var milestoneOpt = new Option<bool?>("--milestone", "마일스톤만(true)/마일스톤 제외(false)");
        var keywordOpt = new Option<string?>("--keyword", "이름·메모 부분일치");
        var overdueStartOpt = new Option<bool>("--overdue-start", "시작 지연 — 계획 시작일이 지났는데 아직 Planned(미착수)");
        var view = new ListViewOptions();

        var c = new Command("list",
            "프로젝트 WBS 조회. 필터/셰이핑 없으면 트리(root+children), 있으면 평면 리스트(ParentId 포함)")
        { projOpt, verOpt, statusOpt, openOpt, activeOnOpt, startFromOpt, startToOpt,
          endFromOpt, endToOpt, assigneeOpt, milestoneOpt, keywordOpt, overdueStartOpt };
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
                Keyword: pr.GetValueForOption(keywordOpt),
                OverdueStart: pr.GetValueForOption(overdueStartOpt));
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
        var statusOpt = new Option<WbsStatus?>("--status", "Planned(기본)|Waiting|InProgress|Done|Suspended");
        var msOpt = new Option<bool?>("--milestone", "마일스톤 여부");
        var importanceOpt = new Option<int?>("--importance", "중요도 1=낮음 / 2=중간 (기본) / 3=높음");
        importanceOpt.AddAlias("--order"); // 사이클 13 사용자 호환 (옛 --order = 중요도 의미)
        var notesOpt = new Option<string?>("--notes", "메모");
        var completedOpt = new Option<DateTime?>("--completed", "완료일(실적) YYYY-MM-DD — 생략 시 Done 이면 오늘 자동");
        var estimateOpt = new Option<double?>("--estimate-hours", "공수 추정(시간) — 용량 계획 기준, leaf 에 입력");
        var actualStartOpt = new Option<DateTime?>("--actual-start", "착수일(실적) YYYY-MM-DD — 생략 시 진행/완료면 오늘 자동");

        var c = new Command("create", "WBS 항목 생성 (SortOrder 는 시작일 그룹 끝에 자동 추가)")
        { projOpt, nameOpt, parentOpt, verOpt, assignOpt, startOpt, endOpt, statusOpt, msOpt, importanceOpt, notesOpt, completedOpt, estimateOpt, actualStartOpt };
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
                Notes: pr.GetValueForOption(notesOpt) ?? string.Empty,
                CompletedDate: pr.GetValueForOption(completedOpt),
                EstimateHours: pr.GetValueForOption(estimateOpt),
                ActualStartDate: pr.GetValueForOption(actualStartOpt));
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
        var statusOpt = new Option<WbsStatus?>("--status", "Planned|Waiting|InProgress|Done|Suspended");
        var msOpt = new Option<bool?>("--milestone", "마일스톤 여부");
        var importanceOpt = new Option<int?>("--importance", "중요도 1=낮음 / 2=중간 / 3=높음");
        importanceOpt.AddAlias("--order"); // 사이클 13 사용자 호환
        var sortOrderOpt = new Option<int?>("--sort-order", "정렬 위치 (드물게 수동, 보통 dnd-kit reorder 사용)");
        var notesOpt = new Option<string?>("--notes", "메모");
        var completedOpt = new Option<DateTime?>("--completed", "완료일(실적) YYYY-MM-DD — Done 전환 시 자동, 직접 보정 가능");
        var estimateOpt = new Option<double?>("--estimate-hours", "공수 추정(시간) — 용량 계획 기준, leaf 에 입력");
        var actualStartOpt = new Option<DateTime?>("--actual-start", "착수일(실적) YYYY-MM-DD — 진행/완료 전환 시 자동, 직접 보정 가능");

        var c = new Command("update", "WBS 항목 부분 갱신 (지정한 옵션만 덮어쓰기)")
        { idOpt, nameOpt, parentOpt, assignOpt, startOpt, endOpt, statusOpt, msOpt, importanceOpt, sortOrderOpt, notesOpt, completedOpt, estimateOpt, actualStartOpt };
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
                CompletedDate: pr.GetValueForOption(completedOpt) ?? existing.CompletedDate,
                UpdatedAt: existing.UpdatedAt,
                EstimateHours: pr.GetValueForOption(estimateOpt) ?? existing.EstimateHours,
                ActualStartDate: pr.GetValueForOption(actualStartOpt) ?? existing.ActualStartDate);
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
                CompletedDate: existing.CompletedDate,
                UpdatedAt: existing.UpdatedAt,
                EstimateHours: existing.EstimateHours,
                ActualStartDate: existing.ActualStartDate);
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

    private static Command BuildAssign(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "WBS 항목 ID") { IsRequired = true };
        var resourceOpt = new Option<string>("--resource", "자원 이름 또는 ID (이름이면 없을 시 생성)") { IsRequired = true };
        var allocOpt = new Option<int>("--allocation", () => 100, "배분율 % (작업 공수 중 이 자원 몫, 기본 100)");
        var c = new Command("assign", "WBS 작업에 자원 배정 + 배분율 (자유텍스트 Assignee 와 병행, 용량 계산의 정본)")
        { idOpt, resourceOpt, allocOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var id = pr.GetValueForOption(idOpt);
            var resource = pr.GetValueForOption(resourceOpt)!;
            var alloc = pr.GetValueForOption(allocOpt);
            var assignSvc = services.GetRequiredService<WbsAssignmentService>();
            var resourceSvc = services.GetRequiredService<ResourceService>();
            int resourceId;
            if (int.TryParse(resource, out var rid)) resourceId = rid;
            else resourceId = (await resourceSvc.GetOrCreateByNameAsync(resource)).Id;
            CliJson.WriteSuccess(await assignSvc.UpsertAsync(id, resourceId, alloc));
        }));
        return c;
    }

    private static Command BuildUnassign(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "WBS 항목 ID") { IsRequired = true };
        var resourceOpt = new Option<int>("--resource-id", "자원 ID") { IsRequired = true };
        var c = new Command("unassign", "WBS 작업에서 자원 배정 제거") { idOpt, resourceOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var id = pr.GetValueForOption(idOpt);
            var resourceId = pr.GetValueForOption(resourceOpt);
            var assignSvc = services.GetRequiredService<WbsAssignmentService>();
            var ok = await assignSvc.RemoveAsync(id, resourceId);
            if (!ok) { ctx.ExitCode = CliJson.WriteError("not_found", "배정을 찾을 수 없습니다."); return; }
            CliJson.WriteSuccess(new { unassigned = true, id, resourceId });
        }));
        return c;
    }

    private static Command BuildAssignments(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "WBS 항목 ID") { IsRequired = true };
        var c = new Command("assignments", "WBS 작업의 구조화 배정(자원 + 배분율) 조회") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var assignSvc = services.GetRequiredService<WbsAssignmentService>();
            CliJson.WriteSuccess(await assignSvc.ListByWbsAsync(id));
        }));
        return c;
    }

    private static Command BuildBackfillAssignments(IServiceProvider services)
    {
        var c = new Command("backfill-assignments",
            "전 프로젝트 WBS 의 자유텍스트 담당자 → WbsAssignment 동기화 (멱등, 이름→Person 자원 해석/생성)");
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var projectRepo = services.GetRequiredService<IProjectRepository>();
            var wbsRepo = services.GetRequiredService<IWbsRepository>();
            var assignSvc = services.GetRequiredService<WbsAssignmentService>();
            var projects = await projectRepo.GetAllAsync();
            var items = 0; var withAssignee = 0;
            foreach (var p in projects)
            {
                var wbsItems = await wbsRepo.GetByProjectAsync(p.Id, null);
                foreach (var w in wbsItems)
                {
                    items++;
                    if (!string.IsNullOrWhiteSpace(w.Assignee)) withAssignee++;
                    await assignSvc.ReconcileFromFreeTextAsync(w);
                }
            }
            CliJson.WriteSuccess(new { backfilled = true, items, withAssignee });
        }));
        return c;
    }

    private static Command BuildLinkDep(IServiceProvider services)
    {
        var predOpt = new Option<int>("--pred", "선행 작업 ID") { IsRequired = true };
        var succOpt = new Option<int>("--succ", "후행 작업 ID") { IsRequired = true };
        var typeOpt = new Option<WbsDependencyType?>("--type", "FinishToStart(기본)|StartToStart|FinishToFinish|StartToFinish");
        var lagOpt = new Option<int>("--lag", () => 0, "지연(영업일). 양수=간격, 음수=중첩");
        var c = new Command("link-dep", "작업 의존성 추가 (선행→후행). 사이클·다른 프로젝트 거부")
        { predOpt, succOpt, typeOpt, lagOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var svc = services.GetRequiredService<WbsDependencyService>();
            try
            {
                CliJson.WriteSuccess(await svc.CreateAsync(new CreateWbsDependencyDto(
                    PredecessorId: pr.GetValueForOption(predOpt),
                    SuccessorId: pr.GetValueForOption(succOpt),
                    Type: pr.GetValueForOption(typeOpt) ?? WbsDependencyType.FinishToStart,
                    LagDays: pr.GetValueForOption(lagOpt))));
            }
            catch (WbsDependencyConflictException ex) { ctx.ExitCode = CliJson.WriteError("conflict", ex.Message); }
        }));
        return c;
    }

    private static Command BuildUnlinkDep(IServiceProvider services)
    {
        var predOpt = new Option<int>("--pred", "선행 작업 ID") { IsRequired = true };
        var succOpt = new Option<int>("--succ", "후행 작업 ID") { IsRequired = true };
        var c = new Command("unlink-dep", "작업 의존성 제거") { predOpt, succOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var svc = services.GetRequiredService<WbsDependencyService>();
            var ok = await svc.DeleteAsync(pr.GetValueForOption(predOpt), pr.GetValueForOption(succOpt));
            if (!ok) { ctx.ExitCode = CliJson.WriteError("not_found", "의존성을 찾을 수 없습니다."); return; }
            CliJson.WriteSuccess(new { unlinked = true });
        }));
        return c;
    }

    private static Command BuildDeps(IServiceProvider services)
    {
        var projOpt = new Option<int?>("--project", "프로젝트 ID (전체 의존성)");
        var idOpt = new Option<int?>("--id", "작업 ID (이 작업에 닿는 의존성)");
        var c = new Command("deps", "의존성 조회 — --project 전체 또는 --id 작업별") { projOpt, idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var svc = services.GetRequiredService<WbsDependencyService>();
            if (pr.GetValueForOption(idOpt) is int wid) CliJson.WriteSuccess(await svc.GetByWbsItemAsync(wid));
            else if (pr.GetValueForOption(projOpt) is int pid) CliJson.WriteSuccess(await svc.GetByProjectAsync(pid));
            else ctx.ExitCode = CliJson.WriteError("missing_arg", "--project 또는 --id 중 하나 필요");
        }));
        return c;
    }

    private static Command BuildCriticalPath(IServiceProvider services)
    {
        var projOpt = new Option<int>("--project", "프로젝트 ID") { IsRequired = true };
        var verOpt = new Option<int?>("--version", "WBS 버전 ID");
        var skipOpt = new Option<bool>("--skip-weekends", () => true, "주말 제외(기본 true)");
        var c = new Command("critical-path", "임계경로(CPM) — ES/EF/LS/LF·부동·임계 여부. 날짜 부족 작업은 indeterminate")
        { projOpt, verOpt, skipOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var svc = services.GetRequiredService<SchedulingService>();
            CliJson.WriteSuccess(await svc.ComputeCriticalPathAsync(
                pr.GetValueForOption(projOpt), pr.GetValueForOption(verOpt), pr.GetValueForOption(skipOpt)));
        }));
        return c;
    }

    private static Command BuildReschedule(IServiceProvider services)
    {
        var projOpt = new Option<int>("--project", "프로젝트 ID") { IsRequired = true };
        var fromOpt = new Option<int?>("--from", "기준 작업 ID(이 작업 기준 후행 이동). 생략 시 프로젝트 전체 리스케줄");
        var applyOpt = new Option<bool>("--apply", "미리보기 대신 실제 적용");
        var skipOpt = new Option<bool>("--skip-weekends", () => true, "주말 제외(기본 true)");
        var c = new Command("reschedule", "의존성 기반 자동 일정 — push-only 이동. --from 지정 시 그 후행만, 생략 시 프로젝트 전체. 기본 미리보기, --apply 시 적용")
        { projOpt, fromOpt, applyOpt, skipOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var svc = services.GetRequiredService<SchedulingService>();
            var pid = pr.GetValueForOption(projOpt);
            var skip = pr.GetValueForOption(skipOpt);
            var preview = pr.GetValueForOption(fromOpt) is int from
                ? await svc.PreviewRescheduleAsync(pid, from, skip)
                : await svc.PreviewProjectRescheduleAsync(pid, skip);
            if (pr.GetValueForOption(applyOpt))
                await svc.ApplyRescheduleAsync(pid, preview.Shifts, preview.SkipWeekends);
            CliJson.WriteSuccess(new { applied = pr.GetValueForOption(applyOpt), preview.Shifts });
        }));
        return c;
    }

    private static Command BuildBaseline(IServiceProvider services)
    {
        var c = new Command("baseline", "기준선(계획 스냅샷) — capture/clear. Gantt 고스트 막대·variance 기준");
        var projOpt = new Option<int>("--project", "프로젝트 ID") { IsRequired = true };
        var verOpt = new Option<int?>("--version", "WBS 버전 ID (생략 시 전체)");

        var cap = new Command("capture", "현재 계획 일정을 기준선으로 박제") { projOpt, verOpt };
        cap.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var svc = services.GetRequiredService<WbsService>();
            var n = await svc.CaptureBaselineAsync(pr.GetValueForOption(projOpt), pr.GetValueForOption(verOpt));
            CliJson.WriteSuccess(new { captured = n });
        }));

        var clr = new Command("clear", "기준선 비우기") { projOpt, verOpt };
        clr.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var svc = services.GetRequiredService<WbsService>();
            var n = await svc.ClearBaselineAsync(pr.GetValueForOption(projOpt), pr.GetValueForOption(verOpt));
            CliJson.WriteSuccess(new { cleared = n });
        }));

        c.AddCommand(cap); c.AddCommand(clr);
        return c;
    }

    private static Command BuildSubtask(IServiceProvider services)
    {
        var c = new Command("subtask", "WBS 서브태스크(경량 체크리스트) — list/add/done/rename/rm");

        var listWbsOpt = new Option<int>("--wbs", "WBS 작업 ID") { IsRequired = true };
        var list = new Command("list", "작업의 서브태스크 목록") { listWbsOpt };
        list.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var wid = ctx.ParseResult.GetValueForOption(listWbsOpt);
            CliJson.WriteSuccess(await services.GetRequiredService<WbsSubtaskService>().ListAsync(wid));
        }));

        var addWbsOpt = new Option<int>("--wbs", "WBS 작업 ID") { IsRequired = true };
        var addTitleOpt = new Option<string>("--title", "서브태스크 제목") { IsRequired = true };
        var add = new Command("add", "서브태스크 추가") { addWbsOpt, addTitleOpt };
        add.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            CliJson.WriteSuccess(await services.GetRequiredService<WbsSubtaskService>()
                .AddAsync(pr.GetValueForOption(addWbsOpt), new CreateWbsSubtaskDto(pr.GetValueForOption(addTitleOpt)!)));
        }));

        var doneIdOpt = new Option<int>("--id", "서브태스크 ID") { IsRequired = true };
        var undoneOpt = new Option<bool>("--undone", "완료 해제(미완으로)");
        var done = new Command("done", "서브태스크 완료 토글 (--undone 으로 미완)") { doneIdOpt, undoneOpt };
        done.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var updated = await services.GetRequiredService<WbsSubtaskService>()
                .UpdateAsync(pr.GetValueForOption(doneIdOpt), new UpdateWbsSubtaskDto(IsDone: !pr.GetValueForOption(undoneOpt)));
            if (updated is null) { ctx.ExitCode = CliJson.WriteError("not_found", "서브태스크 없음"); return; }
            CliJson.WriteSuccess(updated);
        }));

        var renameIdOpt = new Option<int>("--id", "서브태스크 ID") { IsRequired = true };
        var renameTitleOpt = new Option<string>("--title", "새 제목") { IsRequired = true };
        var rename = new Command("rename", "서브태스크 제목 변경") { renameIdOpt, renameTitleOpt };
        rename.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var updated = await services.GetRequiredService<WbsSubtaskService>()
                .UpdateAsync(pr.GetValueForOption(renameIdOpt), new UpdateWbsSubtaskDto(Title: pr.GetValueForOption(renameTitleOpt)));
            if (updated is null) { ctx.ExitCode = CliJson.WriteError("not_found", "서브태스크 없음"); return; }
            CliJson.WriteSuccess(updated);
        }));

        var rmIdOpt = new Option<int>("--id", "서브태스크 ID") { IsRequired = true };
        var rm = new Command("rm", "서브태스크 삭제") { rmIdOpt };
        rm.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(rmIdOpt);
            if (!await services.GetRequiredService<WbsSubtaskService>().DeleteAsync(id))
            { ctx.ExitCode = CliJson.WriteError("not_found", "서브태스크 없음"); return; }
            CliJson.WriteSuccess(new { deleted = true, id });
        }));

        c.AddCommand(list); c.AddCommand(add); c.AddCommand(done); c.AddCommand(rename); c.AddCommand(rm);
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
