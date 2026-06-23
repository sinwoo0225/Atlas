using System.CommandLine;
using Microsoft.Extensions.DependencyInjection;
using ProjectManager.Application.Output;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Cli.Commands;

internal static class ResourceCommands
{
    public static Command Build(IServiceProvider services)
    {
        // Resource 는 전역 — 다른 verb 와 달리 --project 없음.
        var cmd = new Command("resource", "리소스 (list/get/create/update/delete/assignments) — 전역 (프로젝트 무관)");
        cmd.AddCommand(BuildList(services));
        cmd.AddCommand(BuildGet(services));
        cmd.AddCommand(BuildCreate(services));
        cmd.AddCommand(BuildUpdate(services));
        cmd.AddCommand(BuildDelete(services));
        cmd.AddCommand(BuildAssignments(services));
        cmd.AddCommand(BuildResolve(services));
        cmd.AddCommand(BuildCapacity(services));
        cmd.AddCommand(BuildUtilization(services));
        cmd.AddCommand(BuildAvailability(services));
        return cmd;
    }

    private static Command BuildCapacity(IServiceProvider services)
    {
        var idOpt = new Option<int?>("--id", "자원 ID (생략 시 전 자원 히트맵)");
        var weeksOpt = new Option<int>("--weeks", () => 8, "조회 주 수 (기본 8)");
        var c = new Command("capacity", "자원 용량(주별 수요 vs 가용 → 가동률·과배분). --id 생략 시 전 자원 히트맵")
        { idOpt, weeksOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var id = pr.GetValueForOption(idOpt);
            var weeks = pr.GetValueForOption(weeksOpt);
            var svc = services.GetRequiredService<CapacityService>();
            if (id is int rid)
            {
                var row = await svc.GetResourceCapacityAsync(rid, weeks);
                if (row is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"Resource {rid} 없음"); return; }
                CliJson.WriteSuccess(row);
            }
            else CliJson.WriteSuccess(await svc.GetHeatmapAsync(weeks));
        }));
        return c;
    }

    private static Command BuildUtilization(IServiceProvider services)
    {
        var weeksOpt = new Option<int>("--weeks", () => 8, "조회 주 수 (기본 8)");
        var deptOpt = new Option<string?>("--department", "부서 필터");
        var c = new Command("utilization", "교차 프로젝트 가동률 리포트 (자원별 기간 합계·과배분 주수)") { weeksOpt, deptOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var svc = services.GetRequiredService<CapacityService>();
            CliJson.WriteSuccess(await svc.GetUtilizationReportAsync(
                pr.GetValueForOption(weeksOpt), pr.GetValueForOption(deptOpt)));
        }));
        return c;
    }

    private static Command BuildAvailability(IServiceProvider services)
    {
        var c = new Command("availability", "자원 비가용 구간(휴가·공휴일) — add/list/delete");

        var listIdOpt = new Option<int>("--id", "자원 ID") { IsRequired = true };
        var list = new Command("list", "자원의 비가용 구간 조회") { listIdOpt };
        list.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var svc = services.GetRequiredService<ResourceService>();
            CliJson.WriteSuccess(await svc.ListAvailabilityAsync(ctx.ParseResult.GetValueForOption(listIdOpt)));
        }));

        var addIdOpt = new Option<int>("--id", "자원 ID") { IsRequired = true };
        var startOpt = new Option<DateTime>("--start", "시작일 YYYY-MM-DD") { IsRequired = true };
        var endOpt = new Option<DateTime>("--end", "종료일 YYYY-MM-DD") { IsRequired = true };
        var typeOpt = new Option<AvailabilityType?>("--type", "PTO(기본)|Holiday|Other");
        var hoursOpt = new Option<double?>("--hours", "차감 시간 (생략 시 구간 영업일 전부)");
        var noteOpt = new Option<string?>("--note", "메모");
        var add = new Command("add", "비가용 구간 추가") { addIdOpt, startOpt, endOpt, typeOpt, hoursOpt, noteOpt };
        add.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var svc = services.GetRequiredService<ResourceService>();
            CliJson.WriteSuccess(await svc.AddAvailabilityAsync(new CreateResourceAvailabilityDto(
                ResourceId: pr.GetValueForOption(addIdOpt),
                StartDate: pr.GetValueForOption(startOpt),
                EndDate: pr.GetValueForOption(endOpt),
                Type: pr.GetValueForOption(typeOpt) ?? AvailabilityType.PTO,
                Hours: pr.GetValueForOption(hoursOpt),
                Note: pr.GetValueForOption(noteOpt) ?? string.Empty)));
        }));

        var delIdOpt = new Option<int>("--availability-id", "비가용 구간 ID") { IsRequired = true };
        var del = new Command("delete", "비가용 구간 삭제") { delIdOpt };
        del.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var svc = services.GetRequiredService<ResourceService>();
            var ok = await svc.DeleteAvailabilityAsync(ctx.ParseResult.GetValueForOption(delIdOpt));
            if (!ok) { ctx.ExitCode = CliJson.WriteError("not_found", "비가용 구간을 찾을 수 없습니다."); return; }
            CliJson.WriteSuccess(new { deleted = true });
        }));

        c.AddCommand(list); c.AddCommand(add); c.AddCommand(del);
        return c;
    }

    private static Command BuildResolve(IServiceProvider services)
    {
        var nameOpt = new Option<string>("--name", "이름") { IsRequired = true };
        var c = new Command("resolve", "이름으로 Person 리소스 찾기/없으면 생성 (멱등) — '나' 신원 통일용") { nameOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var name = ctx.ParseResult.GetValueForOption(nameOpt)!;
            var svc = services.GetRequiredService<ResourceService>();
            CliJson.WriteSuccess(await svc.GetOrCreateByNameAsync(name));
        }));
        return c;
    }

    private static Command BuildList(IServiceProvider services)
    {
        var typeOpt = new Option<ResourceType?>("--type", "Person | Equipment (없으면 전부)");
        var deptOpt = new Option<string?>("--department", "부서 부분일치");
        var keywordOpt = new Option<string?>("--keyword", "이름·이메일 부분일치");
        var view = new ListViewOptions();

        var c = new Command("list", "리소스 조회 (필터 + 출력 셰이핑) — 전역") { typeOpt, deptOpt, keywordOpt };
        view.AddTo(c);
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var filter = new ResourceListFilter(
                Type: pr.GetValueForOption(typeOpt),
                Department: pr.GetValueForOption(deptOpt),
                Keyword: pr.GetValueForOption(keywordOpt));
            var svc = services.GetRequiredService<ResourceService>();
            var list = await svc.GetAllAsync(filter);
            CliJson.WriteList(list, view.Read(pr, BriefPresets.Resource));
        }));
        return c;
    }

    private static Command BuildGet(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "리소스 ID") { IsRequired = true };
        var c = new Command("get", "단일 리소스 조회") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<ResourceService>();
            var dto = await svc.GetByIdAsync(id);
            if (dto is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"Resource {id} 없음"); return; }
            CliJson.WriteSuccess(dto);
        }));
        return c;
    }

    private static Command BuildCreate(IServiceProvider services)
    {
        var nameOpt = new Option<string>("--name", "이름") { IsRequired = true };
        var typeOpt = new Option<ResourceType?>("--type", "Person(기본)|Equipment");
        var deptOpt = new Option<string?>("--department", "부서");
        var emailOpt = new Option<string?>("--email", "이메일");
        var phoneOpt = new Option<string?>("--phone", "전화번호");
        var notesOpt = new Option<string?>("--notes", "비고 (자유 문자열)");
        var capacityOpt = new Option<double?>("--weekly-capacity", "주당 가용 시간 (기본 40) — 용량 계획 기준");
        var costRateOpt = new Option<decimal?>("--cost-rate", "원가 단가(시간당) — 마진 표시용");
        var billRateOpt = new Option<decimal?>("--bill-rate", "청구 단가(시간당) — 마진 표시용");
        var skillsOpt = new Option<string?>("--skills", "스킬 태그 (콤마 구분)");
        var activeOpt = new Option<bool?>("--active", "활성 여부 (기본 활성) — 비활성은 용량 집계 제외");

        var c = new Command("create", "리소스 생성")
        { nameOpt, typeOpt, deptOpt, emailOpt, phoneOpt, notesOpt, capacityOpt, costRateOpt, billRateOpt, skillsOpt, activeOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var dto = new CreateResourceDto(
                Name: pr.GetValueForOption(nameOpt)!,
                Type: pr.GetValueForOption(typeOpt) ?? ResourceType.Person,
                Department: pr.GetValueForOption(deptOpt) ?? string.Empty,
                Email: pr.GetValueForOption(emailOpt) ?? string.Empty,
                Phone: pr.GetValueForOption(phoneOpt) ?? string.Empty,
                Notes: pr.GetValueForOption(notesOpt) ?? string.Empty,
                WeeklyCapacityHours: pr.GetValueForOption(capacityOpt) ?? 40,
                CostRate: pr.GetValueForOption(costRateOpt),
                BillRate: pr.GetValueForOption(billRateOpt),
                Skills: pr.GetValueForOption(skillsOpt) ?? string.Empty,
                IsActive: pr.GetValueForOption(activeOpt) ?? true);
            var svc = services.GetRequiredService<ResourceService>();
            CliJson.WriteSuccess(await svc.CreateAsync(dto));
        }));
        return c;
    }

    private static Command BuildUpdate(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "리소스 ID") { IsRequired = true };
        var nameOpt = new Option<string?>("--name", "이름");
        var typeOpt = new Option<ResourceType?>("--type", "Person|Equipment");
        var deptOpt = new Option<string?>("--department", "부서");
        var emailOpt = new Option<string?>("--email", "이메일");
        var phoneOpt = new Option<string?>("--phone", "전화번호");
        var notesOpt = new Option<string?>("--notes", "비고");
        var capacityOpt = new Option<double?>("--weekly-capacity", "주당 가용 시간 — 용량 계획 기준");
        var costRateOpt = new Option<decimal?>("--cost-rate", "원가 단가(시간당)");
        var billRateOpt = new Option<decimal?>("--bill-rate", "청구 단가(시간당)");
        var skillsOpt = new Option<string?>("--skills", "스킬 태그 (콤마 구분)");
        var activeOpt = new Option<bool?>("--active", "활성 여부 — 비활성은 용량 집계 제외");

        var c = new Command("update", "리소스 부분 갱신 (지정한 옵션만 덮어쓰기)")
        { idOpt, nameOpt, typeOpt, deptOpt, emailOpt, phoneOpt, notesOpt, capacityOpt, costRateOpt, billRateOpt, skillsOpt, activeOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var pr = ctx.ParseResult;
            var id = pr.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<ResourceService>();
            var existing = await svc.GetByIdAsync(id);
            if (existing is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"Resource {id} 없음"); return; }
            var dto = new UpdateResourceDto(
                Name: pr.GetValueForOption(nameOpt) ?? existing.Name,
                Type: pr.GetValueForOption(typeOpt) ?? existing.Type,
                Department: pr.GetValueForOption(deptOpt) ?? existing.Department,
                Email: pr.GetValueForOption(emailOpt) ?? existing.Email,
                Phone: pr.GetValueForOption(phoneOpt) ?? existing.Phone,
                Notes: pr.GetValueForOption(notesOpt) ?? existing.Notes,
                WeeklyCapacityHours: pr.GetValueForOption(capacityOpt) ?? existing.WeeklyCapacityHours,
                CostRate: pr.GetValueForOption(costRateOpt) ?? existing.CostRate,
                BillRate: pr.GetValueForOption(billRateOpt) ?? existing.BillRate,
                Skills: pr.GetValueForOption(skillsOpt) ?? existing.Skills,
                IsActive: pr.GetValueForOption(activeOpt) ?? existing.IsActive);
            var updated = await svc.UpdateAsync(id, dto);
            if (updated is null) { ctx.ExitCode = CliJson.WriteError("not_found", $"Resource {id} 없음"); return; }
            CliJson.WriteSuccess(updated);
        }));
        return c;
    }

    private static Command BuildDelete(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "리소스 ID") { IsRequired = true };
        var c = new Command("delete", "리소스 삭제") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<ResourceService>();
            var ok = await svc.DeleteAsync(id);
            if (!ok) { ctx.ExitCode = CliJson.WriteError("not_found", $"Resource {id} 없음"); return; }
            CliJson.WriteSuccess(new { deleted = true, id });
        }));
        return c;
    }

    private static Command BuildAssignments(IServiceProvider services)
    {
        var idOpt = new Option<int>("--id", "리소스 ID") { IsRequired = true };
        var c = new Command("assignments", "이 리소스가 할당된 WBS 작업 목록 (Assignee 이름 매칭)") { idOpt };
        c.SetHandler(ctx => HandlerHelpers.RunAsync(ctx, async () =>
        {
            var id = ctx.ParseResult.GetValueForOption(idOpt);
            var svc = services.GetRequiredService<ResourceService>();
            CliJson.WriteSuccess(await svc.GetAssignmentsAsync(id));
        }));
        return c;
    }
}
