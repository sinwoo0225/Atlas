using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

public class IssueService(IIssueRepository repo, WorkLogService workLogService, IMeetingRepository meetingRepo)
{
    private static bool IsCompleted(IssueStatus s) => s == IssueStatus.Resolved || s == IssueStatus.Closed;

    public async Task<IEnumerable<IssueDto>> GetByProjectAsync(int projectId, IssueListFilter? filter = null) =>
        (await repo.GetByProjectAsync(projectId, filter)).Select(ToDto);

    public async Task<IssueDto?> GetByIdAsync(int id)
    {
        var i = await repo.GetByIdAsync(id);
        return i is null ? null : ToDto(i);
    }

    // 즐겨찾기 토글 — IsFavorite 만 갱신(목록 최상단 고정용).
    public async Task<bool> SetFavoriteAsync(int id, bool favorite)
    {
        var i = await repo.GetByIdAsync(id);
        if (i is null) return false;
        i.IsFavorite = favorite;
        await repo.UpdateAsync(i);
        return true;
    }

    public async Task<IssueDto> CreateAsync(CreateIssueDto dto)
    {
        var issue = new Issue
        {
            ProjectId = dto.ProjectId,
            Title = dto.Title,
            Description = dto.Description,
            Status = dto.Status,
            Priority = dto.Priority,
            AssigneeResourceId = dto.AssigneeResourceId,
            DueDate = dto.DueDate,
            OccurredOn = dto.OccurredOn,
            ResolvedDate = dto.ResolvedDate ?? (IsCompleted(dto.Status) ? DateTime.Today : null),
            Category = dto.Category ?? string.Empty,
            CustomFieldsJson = dto.CustomFieldsJson ?? string.Empty
        };
        var created = await repo.CreateAsync(issue);
        var reloaded = (await repo.GetByIdAsync(created.Id))!;
        // 신규 이슈는 등록 당일 업무일지의 '이슈' 필드에 자동 추가.
        await workLogService.AppendIssuesAsync(reloaded.ProjectId, DateTime.Today,
            WorkLogService.FormatIssueLine(reloaded.Title, reloaded.AssigneeResource?.Name));
        return ToDto(reloaded);
    }

    public async Task<IssueDto?> UpdateAsync(int id, UpdateIssueDto dto)
    {
        var issue = await repo.GetByIdAsync(id);
        if (issue is null) return null;
        var wasCompleted = IsCompleted(issue.Status);
        var wasInProgress = issue.Status == IssueStatus.InProgress;
        var titleChanged = issue.Title != dto.Title;
        issue.Title = dto.Title;
        issue.Description = dto.Description;
        issue.Status = dto.Status;
        issue.Priority = dto.Priority;
        issue.AssigneeResourceId = dto.AssigneeResourceId;
        issue.DueDate = dto.DueDate;
        issue.OccurredOn = dto.OccurredOn;
        issue.Category = dto.Category ?? string.Empty;
        // 커스텀 필드: 브라우저는 항상 전체 맵을 보내므로 wholesale 교체. null(미지정, CLI/MCP 부분 수정)은 기존값 보존.
        issue.CustomFieldsJson = dto.CustomFieldsJson ?? issue.CustomFieldsJson;
        // 해결일(실적): 클라값 우선(수동 보정·명시적 클리어). 완료(Resolved/Closed) 진입 시 없으면 오늘, 벗어나면 클리어.
        issue.ResolvedDate = dto.ResolvedDate;
        if (!wasCompleted && IsCompleted(dto.Status) && issue.ResolvedDate is null)
            issue.ResolvedDate = DateTime.Today;
        else if (wasCompleted && !IsCompleted(dto.Status))
            issue.ResolvedDate = null;
        var updated = await repo.UpdateAsync(issue);
        var reloaded = (await repo.GetByIdAsync(updated.Id))!;
        // 시작(InProgress)·완료(Resolved/Closed) 전환 시 당일 '한 일'에 upsert(이슈는 평면).
        // 같은 날 시작→완료면 [시작] 줄이 [완료]로 교체됨(WorkLogMerge).
        if (!wasInProgress && updated.Status == IssueStatus.InProgress)
            await workLogService.UpsertDoneHierarchicalAsync(updated.ProjectId, DateTime.Today,
                [], "이슈", reloaded.Title, reloaded.AssigneeResource?.Name, WorkLogMerge.DoneMarker.Started);
        else if (!wasCompleted && IsCompleted(updated.Status))
            await workLogService.UpsertDoneHierarchicalAsync(updated.ProjectId, DateTime.Today,
                [], "이슈", reloaded.Title, reloaded.AssigneeResource?.Name, WorkLogMerge.DoneMarker.Completed);
        // C-1 양방향 sync (B 방향) — Title 변경 시 회의록 ActionItem.content 도 갱신.
        if (titleChanged)
            await meetingRepo.SyncPromotedIssueContentAsync(updated.ProjectId, updated.Id, updated.Title);
        return ToDto(reloaded);
    }

    // 칸반 드래그 — 상태만 변경. 현재 값으로 UpdateDto 를 구성해 기존 UpdateAsync 재사용
    // (완료(Resolved/Closed) 전환 시 worklog 자동 등록 그대로).
    public async Task<bool> SetStatusAsync(int id, IssueStatus status)
    {
        var issue = await repo.GetByIdAsync(id);
        if (issue is null) return false;
        if (issue.Status == status) return true;
        // 현재 값 전부 전달 — Category·CustomFieldsJson 누락 시 칸반 드래그가 두 필드를 날림.
        var dto = new UpdateIssueDto(
            issue.Title, issue.Description, status, issue.Priority, issue.AssigneeResourceId,
            issue.DueDate, issue.OccurredOn, issue.ResolvedDate, issue.Category, issue.CustomFieldsJson);
        await UpdateAsync(id, dto);
        return true;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var issue = await repo.GetByIdAsync(id);
        if (issue is null) return false;
        var projectId = issue.ProjectId;
        await repo.DeleteAsync(id);
        // C-1 승격 취소 — 삭제된 Issue 를 가리키는 ActionItem.promotedIssueId 정리.
        await meetingRepo.ClearPromotedIssueRefsAsync(projectId, id);
        return true;
    }

    // 분류 자동완성 후보 — 프로젝트 안 distinct Category. DevInfoService.GetDistinctTagsAsync 와 동일 패턴(단일값이라 split 없음).
    public async Task<IReadOnlyList<string>> GetDistinctCategoriesAsync(int projectId, string? sort = null)
    {
        var categories = await repo.GetCategoriesByProjectAsync(projectId);
        if (string.Equals(sort, "freq", StringComparison.OrdinalIgnoreCase))
            return categories
                .GroupBy(c => c, StringComparer.OrdinalIgnoreCase)
                .OrderByDescending(g => g.Count())
                .ThenBy(g => g.First(), StringComparer.CurrentCultureIgnoreCase)
                .Select(g => g.First())
                .ToList();
        return categories
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(c => c, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
    }

    private static IssueDto ToDto(Issue i) => new(
        i.Id, i.ProjectId, i.Title, i.Description,
        i.Status, i.Priority,
        i.AssigneeResourceId, i.AssigneeResource?.Name,
        i.DueDate, i.OccurredOn, i.CreatedAt, i.UpdatedAt, i.ResolvedDate,
        i.Category, i.CustomFieldsJson, i.IsFavorite, i.SequenceNumber);
}
