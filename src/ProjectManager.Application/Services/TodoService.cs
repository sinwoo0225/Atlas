using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

public class TodoService(
    ITodoRepository repo,
    IWbsRepository wbsRepo,
    IIssueRepository issueRepo,
    IResourceRepository resourceRepo,
    ResourceService resourceService,
    IActorAccessor actorAccessor)
{
    public async Task<IEnumerable<TodoItemDto>> GetAllAsync(TodoListFilter? filter = null) =>
        (await repo.GetAllAsync(filter)).Select(ToDto);

    public async Task<TodoItemDto?> GetByIdAsync(int id)
    {
        var t = await repo.GetByIdAsync(id);
        return t is null ? null : ToDto(t);
    }

    public async Task<TodoItemDto> CreateAsync(CreateTodoItemDto dto)
    {
        // SortOrder 자동 — 기존 항목 max+1 (없으면 0). 사용자 정렬은 이후 update 로.
        var all = await repo.GetAllAsync(TodoListFilter.None);
        var nextSort = all.Any() ? all.Max(x => x.SortOrder) + 1 : 0;

        // 담당자 미지정이면 작성자(actor = 설정의 기본작성자/X-Atlas-Actor)에게 자동 귀속 —
        // 개인 TODO 는 '항상 내 할 일' 개념. 신원이 리소스로 존재하도록 멱등 get-or-create.
        var assigneeId = dto.AssigneeResourceId;
        if (assigneeId is null)
        {
            var actor = actorAccessor.GetActor();
            if (!string.IsNullOrWhiteSpace(actor))
                assigneeId = (await resourceService.GetOrCreateByNameAsync(actor)).Id;
        }

        var item = new TodoItem
        {
            Title = dto.Title,
            Notes = dto.Notes,
            AssigneeResourceId = assigneeId,
            DueDate = dto.DueDate,
            Status = dto.Status,
            CompletedDate = dto.CompletedDate ?? (dto.Status == TodoStatus.Done ? DateTime.Today : null),
            Recurrence = dto.Recurrence,
            RecurrenceInterval = dto.RecurrenceInterval < 1 ? 1 : dto.RecurrenceInterval,
            SortOrder = nextSort,
        };
        return ToDto(await repo.CreateAsync(item));
    }

    public async Task<TodoItemDto?> UpdateAsync(int id, UpdateTodoItemDto dto)
    {
        var item = await repo.GetByIdAsync(id);
        if (item is null) return null;
        var wasDone = item.Status == TodoStatus.Done;
        item.Title = dto.Title;
        item.Notes = dto.Notes;
        item.AssigneeResourceId = dto.AssigneeResourceId;
        item.DueDate = dto.DueDate;
        item.Status = dto.Status;
        item.SortOrder = dto.SortOrder;
        item.Recurrence = dto.Recurrence;
        item.RecurrenceInterval = dto.RecurrenceInterval < 1 ? 1 : dto.RecurrenceInterval;
        // 완료일(실적): 클라값 우선. Done 진입 시 없으면 오늘, 벗어나면 클리어.
        // 반복 재생성은 여기서 하지 않는다 — CompleteAsync(완료 버튼) 한 곳에서만 처리해 중복 생성 방지.
        item.CompletedDate = dto.CompletedDate;
        if (!wasDone && dto.Status == TodoStatus.Done && item.CompletedDate is null)
            item.CompletedDate = DateTime.Today;
        else if (wasDone && dto.Status != TodoStatus.Done)
            item.CompletedDate = null;
        return ToDto(await repo.UpdateAsync(item, dto.UpdatedAt));
    }

    // 완료 처리 — 멱등(이미 Done 이면 재스폰 없이 통과). 반복 TODO 면 다음 1회차를 자동 생성.
    public async Task<bool> CompleteAsync(int id)
    {
        var item = await repo.GetByIdAsync(id);
        if (item is null) return false;
        if (item.Status == TodoStatus.Done) return true;
        item.Status = TodoStatus.Done;
        item.CompletedDate = DateTime.Today;
        await repo.UpdateAsync(item, item.UpdatedAt);
        if (item.Recurrence != TodoRecurrence.None)
            await repo.CreateAsync(SpawnNext(item));
        return true;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var item = await repo.GetByIdAsync(id);
        if (item is null) return false;
        await repo.DeleteAsync(id);
        return true;
    }

    // 통합 '내 업무' — 내게 할당된 미완 WBS + 미해결 이슈 + 미완 독립 TODO 를 한 리스트로.
    // WBS/이슈: assigneeResourceId 가 null 이면 필터 없이 전체(= '전체 보기', 프로젝트 공유물).
    // 개인 TODO: 개인 메모 성격이라 scope(mine/all) 와 무관하게 '항상 본인 것'만 노출.
    public async Task<MyWorkDto> GetMyWorkAsync(int? assigneeResourceId)
    {
        string? myName = null;
        if (assigneeResourceId is int rid)
            myName = (await resourceRepo.GetByIdAsync(rid))?.Name;

        var items = new List<MyWorkItemDto>();

        // 1) 독립 TODO — '전체' 에서도 본인 것만. 본인 판정:
        //    내 리소스에 할당됐거나(담당자 기준), 담당자 없이 내가 작성한 항목(레거시/무할당 보완).
        //    '나' 리소스 id 는 전달된 assigneeResourceId, 없으면 actor(작성자) 이름으로 조회(읽기 — create 안 함).
        var actor = actorAccessor.GetActor();
        var myTodoResId = assigneeResourceId;
        if (myTodoResId is null && !string.IsNullOrWhiteSpace(actor))
            myTodoResId = (await resourceRepo.GetAllAsync())
                .FirstOrDefault(r => r.Type == ResourceType.Person
                    && string.Equals(r.Name, actor, StringComparison.OrdinalIgnoreCase))?.Id;

        foreach (var t in await repo.GetOpenAsync(null))
        {
            var mine =
                (myTodoResId is int tid && t.AssigneeResourceId == tid)
                || (t.AssigneeResourceId is null && !string.IsNullOrWhiteSpace(actor)
                    && string.Equals(t.CreatedBy, actor, StringComparison.OrdinalIgnoreCase));
            if (!mine) continue;
            items.Add(new MyWorkItemDto(
                "todo", t.Id, null, null, t.Title, t.Status.ToString(), null,
                t.DueDate, t.CompletedDate,
                t.Recurrence == TodoRecurrence.None ? null : t.Recurrence.ToString()));
        }

        // 2) WBS (미완) — Assignee 자유문자열을 내 리소스 이름과 토큰 매칭.
        foreach (var w in await wbsRepo.GetOpenAcrossProjectsAsync())
        {
            if (myName is not null && !AssigneeMatches(w.Assignee, myName)) continue;
            items.Add(new MyWorkItemDto(
                "wbs", w.Id, w.ProjectId, w.Project?.Name, w.Name, w.Status.ToString(), null,
                w.EndDate, w.CompletedDate, null));
        }

        // 3) 이슈 (미해결) — AssigneeResourceId 정확 일치.
        foreach (var i in await issueRepo.GetOpenAcrossProjectsAsync())
        {
            if (assigneeResourceId is int aid && i.AssigneeResourceId != aid) continue;
            items.Add(new MyWorkItemDto(
                "issue", i.Id, i.ProjectId, i.Project?.Name, i.Title, i.Status.ToString(),
                i.Priority.ToString(), i.DueDate, null, null));
        }

        // 마감일 가까운 순(null 마지막).
        var sorted = items.OrderBy(x => x.DueDate ?? DateTime.MaxValue).ToList();
        return new MyWorkDto(sorted);
    }

    // WBS Assignee 는 "Alice, Bob" 처럼 콤마 직렬화일 수 있다 — 토큰 분해 후 정확 일치(대소문자 무시).
    private static bool AssigneeMatches(string? assignee, string name)
    {
        if (string.IsNullOrWhiteSpace(assignee)) return false;
        return assignee
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Any(p => string.Equals(p, name, StringComparison.OrdinalIgnoreCase));
    }

    private static TodoItem SpawnNext(TodoItem done)
    {
        // 하이브리드: 마감일이 있으면 마감일 기준, 없으면 완료일 기준으로 다음 주기 1회차.
        var basis = done.DueDate ?? done.CompletedDate ?? DateTime.Today;
        return new TodoItem
        {
            Title = done.Title,
            Notes = done.Notes,
            AssigneeResourceId = done.AssigneeResourceId,
            DueDate = AddPeriod(basis, done.Recurrence, done.RecurrenceInterval),
            Status = TodoStatus.Open,
            Recurrence = done.Recurrence,
            RecurrenceInterval = done.RecurrenceInterval,
            SortOrder = done.SortOrder,
        };
    }

    private static DateTime AddPeriod(DateTime d, TodoRecurrence r, int interval)
    {
        var n = interval < 1 ? 1 : interval;
        return r switch
        {
            TodoRecurrence.Daily => d.AddDays(n),
            TodoRecurrence.Weekly => d.AddDays(7 * n),
            TodoRecurrence.Monthly => d.AddMonths(n),
            TodoRecurrence.Yearly => d.AddYears(n),
            _ => d,
        };
    }

    private static TodoItemDto ToDto(TodoItem t) => new(
        t.Id, t.Title, t.Notes,
        t.AssigneeResourceId, t.AssigneeResource?.Name,
        t.DueDate, t.Status, t.CompletedDate,
        t.Recurrence, t.RecurrenceInterval, t.SortOrder,
        t.CreatedAt, t.UpdatedAt);
}
