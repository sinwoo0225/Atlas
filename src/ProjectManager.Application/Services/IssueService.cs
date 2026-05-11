using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

public class IssueService(IIssueRepository repo)
{
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
            DueDate = dto.DueDate
        };
        var created = await repo.CreateAsync(issue);
        return ToDto((await repo.GetByIdAsync(created.Id))!);
    }

    public async Task<IssueDto?> UpdateAsync(int id, UpdateIssueDto dto)
    {
        var issue = await repo.GetByIdAsync(id);
        if (issue is null) return null;
        issue.Title = dto.Title;
        issue.Description = dto.Description;
        issue.Status = dto.Status;
        issue.Priority = dto.Priority;
        issue.AssigneeResourceId = dto.AssigneeResourceId;
        issue.DueDate = dto.DueDate;
        var updated = await repo.UpdateAsync(issue);
        return ToDto((await repo.GetByIdAsync(updated.Id))!);
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var issue = await repo.GetByIdAsync(id);
        if (issue is null) return false;
        await repo.DeleteAsync(id);
        return true;
    }

    private static IssueDto ToDto(Issue i) => new(
        i.Id, i.ProjectId, i.Title, i.Description,
        i.Status, i.Priority,
        i.AssigneeResourceId, i.AssigneeResource?.Name,
        i.DueDate, i.CreatedAt, i.UpdatedAt);
}
