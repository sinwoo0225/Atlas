using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

public class IssueService(IIssueRepository repo, WorkLogService workLogService, IMeetingRepository meetingRepo)
{
    private static bool IsCompleted(IssueStatus s) => s == IssueStatus.Resolved || s == IssueStatus.Closed;

    public async Task<IEnumerable<IssueDto>> GetByProjectAsync(int projectId) =>
        (await repo.GetByProjectAsync(projectId)).Select(ToDto);

    public async Task<IssueDto?> GetByIdAsync(int id)
    {
        var i = await repo.GetByIdAsync(id);
        return i is null ? null : ToDto(i);
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
            OccurredOn = dto.OccurredOn
        };
        var created = await repo.CreateAsync(issue);
        return ToDto((await repo.GetByIdAsync(created.Id))!);
    }

    public async Task<IssueDto?> UpdateAsync(int id, UpdateIssueDto dto)
    {
        var issue = await repo.GetByIdAsync(id);
        if (issue is null) return null;
        var wasCompleted = IsCompleted(issue.Status);
        var titleChanged = issue.Title != dto.Title;
        issue.Title = dto.Title;
        issue.Description = dto.Description;
        issue.Status = dto.Status;
        issue.Priority = dto.Priority;
        issue.AssigneeResourceId = dto.AssigneeResourceId;
        issue.DueDate = dto.DueDate;
        issue.OccurredOn = dto.OccurredOn;
        var updated = await repo.UpdateAsync(issue);
        var reloaded = (await repo.GetByIdAsync(updated.Id))!;
        if (!wasCompleted && IsCompleted(updated.Status))
            await workLogService.AppendDoneAsync(updated.ProjectId, DateTime.Today,
                WorkLogService.FormatDoneLine("이슈", reloaded.Title, reloaded.AssigneeResource?.Name, DateTime.Today));
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
        var dto = new UpdateIssueDto(
            issue.Title, issue.Description, status, issue.Priority, issue.AssigneeResourceId, issue.DueDate, issue.OccurredOn);
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

    private static IssueDto ToDto(Issue i) => new(
        i.Id, i.ProjectId, i.Title, i.Description,
        i.Status, i.Priority,
        i.AssigneeResourceId, i.AssigneeResource?.Name,
        i.DueDate, i.OccurredOn, i.CreatedAt, i.UpdatedAt);
}
