using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Output;
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
        var statusOpt = CliOptions.EnumList<ProjectStatus>("--status", "상태 필터 (다중: Waiting,InProgress)");
        var openOpt = new Option<bool>("--open", "진행/대기 중만 (완료·유지보수 제외) — --status 미지정 시 적용");
        var activeOnOpt = CliOptions.DateOrKeyword("--active-on", "그 날 진행 중 (시작<=날짜<=종료). today|now 또는 YYYY-MM-DD");
        var startFromOpt = new Option<DateTime?>("--start-from", "시작일 >= YYYY-MM-DD");
        var startToOpt = new Option<DateTime?>("--start-to", "시작일 <= YYYY-MM-DD (해당일 포함)");
        var endFromOpt = new Option<DateTime?>("--end-from", "종료일 >= YYYY-MM-DD");
        var endToOpt = new Option<DateTime?>("--end-to", "종료일 <= YYYY-MM-DD (해당일 포함)");
        var categoryOpt = new Option<string?>("--category", "구분 부분일치 (과제·내부·사업 등)");
        var keywordOpt = new Option<string?>("--keyword", "이름·설명·목표 부분일치");
        var view = new ListViewOptions();

        var c = new Command("list", "프로젝트 조회 (필터 + 출력 셰이핑)")
        { statusOpt, openOpt, activeOnOpt, startFromOpt, startToOpt, endFromOpt, endToOpt, categoryOpt, keywordOpt };
        view.AddTo(c);
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var statuses = pr.GetValueForOption(statusOpt);
            IReadOnlyList<ProjectStatus>? statusFilter =
                statuses is { Length: > 0 } ? statuses
                : (pr.GetValueForOption(openOpt) ? ProjectListFilter.OpenStatuses : null);
            var filter = new ProjectListFilter(
                Statuses: statusFilter,
                ActiveOn: pr.GetValueForOption(activeOnOpt),
                StartFrom: pr.GetValueForOption(startFromOpt),
                StartTo: pr.GetValueForOption(startToOpt),
                EndFrom: pr.GetValueForOption(endFromOpt),
                EndTo: pr.GetValueForOption(endToOpt),
                Category: pr.GetValueForOption(categoryOpt),
                Keyword: pr.GetValueForOption(keywordOpt));
            var svc = services.GetRequiredService<ProjectService>();
            var list = await svc.GetAllAsync(filter);
            CliJson.WriteList(list, view.Read(pr, BriefPresets.Project));
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
        var categoryOpt = new Option<string?>("--category", "프로젝트 구분 (과제|내부|사업 등)");
        var descOpt = new Option<string?>("--description", "설명");
        var goalOpt = new Option<string?>("--goal", "목표");
        var statusOpt = new Option<ProjectStatus?>("--status", "Waiting(대기/보류)|InProgress|Done|Maintenance(하자보수/유지보수)");
        var startOpt = new Option<DateTime?>("--start", "시작일 YYYY-MM-DD");
        var endOpt = new Option<DateTime?>("--end", "종료일 YYYY-MM-DD");
        var budgetOpt = new Option<decimal?>("--budget", "예산");
        var partOpt = new Option<string?>("--participants", "참여자");
        var delivOpt = new Option<string?>("--deliverables", "산출물");
        var linksOpt = new Option<string?>("--links", "관련 링크");
        var gitOpt = new Option<string?>("--git", "git 저장소 경로 (git 이력 보기용, 절대 경로). 열람은 데스크톱 앱 전용.");

        var c = new Command("create", "프로젝트 생성")
        { nameOpt, categoryOpt, descOpt, goalOpt, statusOpt, startOpt, endOpt, budgetOpt, partOpt, delivOpt, linksOpt, gitOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var dto = new CreateProjectDto(
                Name: pr.GetValueForOption(nameOpt)!,
                Category: pr.GetValueForOption(categoryOpt) ?? string.Empty,
                Description: pr.GetValueForOption(descOpt) ?? string.Empty,
                Goal: pr.GetValueForOption(goalOpt) ?? string.Empty,
                Status: pr.GetValueForOption(statusOpt) ?? ProjectStatus.Waiting,
                StartDate: pr.GetValueForOption(startOpt),
                EndDate: pr.GetValueForOption(endOpt),
                Budget: pr.GetValueForOption(budgetOpt),
                Participants: pr.GetValueForOption(partOpt) ?? string.Empty,
                Deliverables: pr.GetValueForOption(delivOpt) ?? string.Empty,
                RelatedLinks: pr.GetValueForOption(linksOpt) ?? string.Empty,
                GitRepoPath: pr.GetValueForOption(gitOpt));
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
        var categoryOpt = new Option<string?>("--category", "프로젝트 구분 (과제|내부|사업 등)");
        var descOpt = new Option<string?>("--description", "설명");
        var goalOpt = new Option<string?>("--goal", "목표");
        var statusOpt = new Option<ProjectStatus?>("--status", "Waiting(대기/보류)|InProgress|Done|Maintenance(하자보수/유지보수)");
        var startOpt = new Option<DateTime?>("--start", "시작일 YYYY-MM-DD");
        var endOpt = new Option<DateTime?>("--end", "종료일 YYYY-MM-DD");
        var budgetOpt = new Option<decimal?>("--budget", "예산");
        var partOpt = new Option<string?>("--participants", "참여자");
        var delivOpt = new Option<string?>("--deliverables", "산출물");
        var linksOpt = new Option<string?>("--links", "관련 링크");
        var gitOpt = new Option<string?>("--git", "git 저장소 경로 (절대 경로). 미지정 시 기존 값 유지.");

        var c = new Command("update", "프로젝트 부분 갱신 (지정한 옵션만 덮어쓰기)")
        { idOpt, nameOpt, categoryOpt, descOpt, goalOpt, statusOpt, startOpt, endOpt, budgetOpt, partOpt, delivOpt, linksOpt, gitOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var id = pr.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<ProjectService>();
            var existing = await svc.GetByIdAsync(id);
            if (existing is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"Project {id} 없음"); return; }
            var dto = new UpdateProjectDto(
                Name: pr.GetValueForOption(nameOpt) ?? existing.Name,
                Category: pr.GetValueForOption(categoryOpt) ?? existing.Category,
                Description: pr.GetValueForOption(descOpt) ?? existing.Description,
                Goal: pr.GetValueForOption(goalOpt) ?? existing.Goal,
                Status: pr.GetValueForOption(statusOpt) ?? existing.Status,
                StartDate: pr.GetValueForOption(startOpt) ?? existing.StartDate,
                EndDate: pr.GetValueForOption(endOpt) ?? existing.EndDate,
                Budget: pr.GetValueForOption(budgetOpt) ?? existing.Budget,
                Participants: pr.GetValueForOption(partOpt) ?? existing.Participants,
                Deliverables: pr.GetValueForOption(delivOpt) ?? existing.Deliverables,
                RelatedLinks: pr.GetValueForOption(linksOpt) ?? existing.RelatedLinks,
                GitRepoPath: pr.GetValueForOption(gitOpt) ?? existing.GitRepoPath);
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
