using System.ComponentModel;
using ModelContextProtocol.Server;
using ProjectManager.Application.Output;
using ProjectManager.Application.Services;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Mcp.Tools;

[McpServerToolType]
public static class WbsTools
{
    [McpServerTool(Name = "atlas_wbs_list"),
     Description("프로젝트 WBS 조회. 필터/셰이핑 없으면 트리(root+children), 있으면 평면 리스트(ParentId 포함). " +
                 "진행 중만 open=true, 특정일 진행 중은 activeOn=YYYY-MM-DD (시작<=날짜<=종료).")]
    public static async Task<string> List(
        WbsService svc,
        [Description("프로젝트 ID")] int projectId,
        [Description("WBS 버전 ID (없으면 현재 버전)")] int? versionId = null,
        [Description("상태 다중 필터 (Planned|InProgress|Done)")] WbsStatus[]? statuses = null,
        [Description("미완만 (Planned|InProgress) — statuses 미지정 시 적용")] bool open = false,
        [Description("그 날 진행 중 (시작<=날짜<=종료) YYYY-MM-DD")] DateTime? activeOn = null,
        [Description("시작일 >= YYYY-MM-DD")] DateTime? startFrom = null,
        [Description("시작일 <= YYYY-MM-DD (해당일 포함)")] DateTime? startTo = null,
        [Description("종료일 >= YYYY-MM-DD")] DateTime? endFrom = null,
        [Description("종료일 <= YYYY-MM-DD (해당일 포함)")] DateTime? endTo = null,
        [Description("담당자 부분일치")] string? assignee = null,
        [Description("마일스톤만(true)/제외(false)")] bool? milestone = null,
        [Description("이름·메모 부분일치")] string? keyword = null,
        [Description("시작 지연 — 계획 시작일이 지났는데 아직 Planned(미착수)")] bool overdueStart = false,
        [Description("개수만 반환")] bool count = false,
        [Description("최대 N 건")] int? limit = null,
        [Description("축약 필드만")] bool brief = false,
        [Description("쉼표구분 필드만 (예: id,name,status)")] string? fields = null)
    {
        IReadOnlyList<WbsStatus>? statusFilter =
            statuses is { Length: > 0 } ? statuses : (open ? WbsListFilter.OpenStatuses : null);
        var filter = new WbsListFilter(
            Statuses: statusFilter,
            ActiveOn: activeOn,
            StartFrom: startFrom, StartTo: startTo,
            EndFrom: endFrom, EndTo: endTo,
            Assignee: assignee,
            Milestone: milestone,
            Keyword: keyword,
            OverdueStart: overdueStart);
        var view = McpJson.View(count, limit, brief, fields, BriefPresets.Wbs);
        var shaped = view.Count || view.Limit is not null || view.Fields is { Count: > 0 };

        // 필터·셰이핑이 있으면 평면(트리로 묶으면 매칭 하위 소실), 없으면 기존 트리 그대로.
        if (!filter.IsEmpty || shaped)
            return McpJson.SerializeList(await svc.QueryAsync(projectId, versionId, filter), view);
        return McpJson.Serialize(await svc.GetByProjectAsync(projectId, versionId));
    }

    [McpServerTool(Name = "atlas_wbs_get"), Description("단일 WBS 항목 상세 조회")]
    public static async Task<string> Get(WbsService svc, int id)
    {
        var dto = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"WbsItem {id} 없음");
        return McpJson.Serialize(dto);
    }

    [McpServerTool(Name = "atlas_wbs_context"),
     Description("WBS 작업 한 건의 종합 컨텍스트 한 방 조회 — item·children·relatedDevInfo(filePath=깃 저장소 경로·content=스펙 포함)·" +
                 "relatedIssues·sourceChangeLogs. '관련 정보 참고해 개발' 을 1콜로(여러 list 호출 대체).")]
    public static async Task<string> Context(
        WbsContextService svc,
        [Description("WBS 항목 ID")] int wbsItemId,
        [Description("하위 작업 포함(기본 true)")] bool includeChildren = true,
        [Description("연결된 업무 정보 포함(기본 true)")] bool includeDevInfo = true,
        [Description("연결된 이슈 포함(기본 true)")] bool includeIssues = true,
        [Description("출처 변경이력 포함(기본 true)")] bool includeChangeLogs = true)
    {
        var bundle = await svc.GetContextAsync(wbsItemId, includeChildren, includeDevInfo, includeIssues, includeChangeLogs)
            ?? throw new InvalidOperationException($"WbsItem {wbsItemId} 없음");
        return McpJson.Serialize(bundle);
    }

    [McpServerTool(Name = "atlas_wbs_create"),
     Description("WBS 항목 생성. parentId 없으면 root, status 기본 Planned")]
    public static async Task<string> Create(
        WbsService svc,
        [Description("프로젝트 ID")] int projectId,
        [Description("이름")] string name,
        [Description("상위 WBS 항목 ID (없으면 root)")] int? parentId = null,
        [Description("WBS 버전 ID")] int? versionId = null,
        [Description("담당자 (자유 문자열)")] string? assignee = null,
        DateTime? startDate = null, DateTime? endDate = null,
        [Description("Planned|InProgress|Done")] WbsStatus? status = null,
        [Description("마일스톤 여부")] bool? isMilestone = null,
        [Description("중요도 1=낮음 / 2=중간 (기본) / 3=높음")] int? importance = null,
        string? notes = null,
        [Description("완료일(실적) YYYY-MM-DD — 생략 시 Done 이면 오늘 자동")] DateTime? completedDate = null,
        [Description("공수 추정(시간) — 용량 계획 기준, leaf 에 입력")] double? estimateHours = null,
        [Description("착수일(실적) YYYY-MM-DD — 생략 시 진행/완료면 오늘 자동")] DateTime? actualStartDate = null) =>
        McpJson.Serialize(await svc.CreateAsync(new CreateWbsItemDto(
            ProjectId: projectId,
            VersionId: versionId,
            ParentId: parentId,
            Name: name,
            Assignee: assignee ?? string.Empty,
            StartDate: startDate,
            EndDate: endDate,
            Status: status ?? WbsStatus.Planned,
            IsMilestone: isMilestone ?? false,
            Importance: importance ?? 2,
            Notes: notes ?? string.Empty,
            CompletedDate: completedDate,
            EstimateHours: estimateHours,
            ActualStartDate: actualStartDate)));

    [McpServerTool(Name = "atlas_wbs_update"),
     Description("WBS 항목 부분 갱신 — null 인 필드는 기존 값 유지. root 로 옮기려면 atlas_wbs_move 사용")]
    public static async Task<string> Update(
        WbsService svc, int id,
        string? name = null,
        [Description("새 상위 ID. null 이면 현 parent 유지 (root 화는 atlas_wbs_move)")] int? parentId = null,
        string? assignee = null,
        DateTime? startDate = null, DateTime? endDate = null,
        WbsStatus? status = null, bool? isMilestone = null,
        [Description("중요도 1=낮음 / 2=중간 / 3=높음")] int? importance = null,
        [Description("정렬 위치 — 보통 생략 (신규 시 자동 끝에 추가, reorder 는 GUI dnd 사용)")] int? sortOrder = null,
        string? notes = null,
        [Description("완료일(실적) YYYY-MM-DD — Done 전환 시 자동, 직접 보정 가능")] DateTime? completedDate = null,
        [Description("공수 추정(시간) — 용량 계획 기준, leaf 에 입력")] double? estimateHours = null,
        [Description("착수일(실적) YYYY-MM-DD — 진행/완료 전환 시 자동, 직접 보정 가능")] DateTime? actualStartDate = null)
    {
        var existing = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"WbsItem {id} 없음");
        return McpJson.Serialize(await svc.UpdateAsync(id, new UpdateWbsItemDto(
            ParentId: parentId ?? existing.ParentId,
            Name: name ?? existing.Name,
            Assignee: assignee ?? existing.Assignee,
            StartDate: startDate ?? existing.StartDate,
            EndDate: endDate ?? existing.EndDate,
            Status: status ?? existing.Status,
            IsMilestone: isMilestone ?? existing.IsMilestone,
            Importance: importance ?? existing.Importance,
            Notes: notes ?? existing.Notes,
            SortOrder: sortOrder ?? existing.SortOrder,
            CompletedDate: completedDate ?? existing.CompletedDate,
            UpdatedAt: existing.UpdatedAt,
            EstimateHours: estimateHours ?? existing.EstimateHours,
            ActualStartDate: actualStartDate ?? existing.ActualStartDate)));
    }

    [McpServerTool(Name = "atlas_wbs_move"),
     Description("WBS subtree 이동 (parent 변경 + Order 자동 재계산). root 로 옮기려면 root=true")]
    public static async Task<string> Move(
        WbsService svc,
        [Description("이동할 WBS 항목 ID")] int id,
        [Description("새 상위 ID. root 로 옮기려면 null + root=true")] int? parentId = null,
        [Description("true 면 root 로 이동 (parentId 무시)")] bool root = false)
    {
        if (parentId is null && !root)
            throw new InvalidOperationException("parentId 또는 root=true 중 하나가 필요합니다.");
        var existing = await svc.GetByIdAsync(id)
            ?? throw new InvalidOperationException($"WbsItem {id} 없음");
        return McpJson.Serialize(await svc.UpdateAsync(id, new UpdateWbsItemDto(
            ParentId: root ? null : parentId,
            Name: existing.Name, Assignee: existing.Assignee,
            StartDate: existing.StartDate, EndDate: existing.EndDate,
            Status: existing.Status, IsMilestone: existing.IsMilestone,
            Importance: existing.Importance, Notes: existing.Notes,
            SortOrder: existing.SortOrder, // parentChanged 분기라 백엔드가 덮어씀
            CompletedDate: existing.CompletedDate,
            UpdatedAt: existing.UpdatedAt,
            EstimateHours: existing.EstimateHours,
            ActualStartDate: existing.ActualStartDate)));
    }

    [McpServerTool(Name = "atlas_wbs_delete"),
     Description("WBS 항목 삭제. 회의록 ActionItem.promotedWbsItemId 자동 정리")]
    public static async Task<string> Delete(WbsService svc, int id)
    {
        if (!await svc.DeleteAsync(id))
            throw new InvalidOperationException($"WbsItem {id} 없음");
        return McpJson.Serialize(new { deleted = true, id });
    }

    [McpServerTool(Name = "atlas_wbs_subtask_list"),
     Description("WBS 작업의 서브태스크(경량 체크리스트) 목록")]
    public static async Task<string> SubtaskList(
        WbsSubtaskService svc, [Description("WBS 작업 ID")] int wbsItemId) =>
        McpJson.Serialize(await svc.ListAsync(wbsItemId));

    [McpServerTool(Name = "atlas_wbs_subtask_add"),
     Description("WBS 작업에 서브태스크 추가 (TODO 식 세부 단계)")]
    public static async Task<string> SubtaskAdd(
        WbsSubtaskService svc,
        [Description("WBS 작업 ID")] int wbsItemId,
        [Description("서브태스크 제목")] string title) =>
        McpJson.Serialize(await svc.AddAsync(wbsItemId, new CreateWbsSubtaskDto(title)));

    [McpServerTool(Name = "atlas_wbs_subtask_update"),
     Description("서브태스크 부분 갱신 — 완료 토글(isDone)·제목(title). null 인 필드는 미변경")]
    public static async Task<string> SubtaskUpdate(
        WbsSubtaskService svc,
        [Description("서브태스크 ID")] int id,
        string? title = null, bool? isDone = null)
    {
        var updated = await svc.UpdateAsync(id, new UpdateWbsSubtaskDto(title, isDone))
            ?? throw new InvalidOperationException($"WbsSubtask {id} 없음");
        return McpJson.Serialize(updated);
    }

    [McpServerTool(Name = "atlas_wbs_subtask_delete"),
     Description("서브태스크 삭제")]
    public static async Task<string> SubtaskDelete(
        WbsSubtaskService svc, [Description("서브태스크 ID")] int id)
    {
        if (!await svc.DeleteAsync(id))
            throw new InvalidOperationException($"WbsSubtask {id} 없음");
        return McpJson.Serialize(new { deleted = true, id });
    }
}
