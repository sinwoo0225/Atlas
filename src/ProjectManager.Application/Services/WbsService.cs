using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

public class WbsService(IWbsRepository repo, WorkLogService workLogService)
{
    public async Task<IEnumerable<WbsItemDto>> GetByProjectAsync(int projectId, int? versionId = null)
    {
        var items = await repo.GetByProjectAsync(projectId, versionId);
        var roots = items.Where(x => x.ParentId == null);
        return roots.Select(x => ToDto(x, items));
    }

    public async Task<WbsItemDto?> GetByIdAsync(int id)
    {
        var item = await repo.GetByIdAsync(id);
        return item is null ? null : ToDto(item, []);
    }

    public async Task<WbsItemDto> CreateAsync(CreateWbsItemDto dto)
    {
        var item = new WbsItem
        {
            ProjectId = dto.ProjectId, VersionId = dto.VersionId, ParentId = dto.ParentId,
            Name = dto.Name, Assignee = dto.Assignee,
            StartDate = dto.StartDate, EndDate = dto.EndDate,
            Status = dto.Status, IsMilestone = dto.IsMilestone,
            Order = dto.Order, Notes = dto.Notes
        };
        return ToDto(await repo.CreateAsync(item), []);
    }

    public async Task<WbsItemDto?> UpdateAsync(int id, UpdateWbsItemDto dto)
    {
        var item = await repo.GetByIdAsync(id);
        if (item is null) return null;
        var wasDone = item.Status == WbsStatus.Done;
        item.Name = dto.Name; item.Assignee = dto.Assignee;
        item.StartDate = dto.StartDate; item.EndDate = dto.EndDate;
        item.Status = dto.Status; item.IsMilestone = dto.IsMilestone;
        item.Order = dto.Order; item.Notes = dto.Notes;
        var updated = await repo.UpdateAsync(item);
        if (!wasDone && updated.Status == WbsStatus.Done)
            await workLogService.AppendDoneAsync(updated.ProjectId, DateTime.Today, $"- {updated.Name}");
        return ToDto(updated, []);
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var item = await repo.GetByIdAsync(id);
        if (item is null) return false;
        await repo.DeleteAsync(id);
        return true;
    }

    public async Task<IEnumerable<WbsVersionDto>> GetVersionsAsync(int projectId) =>
        (await repo.GetVersionsByProjectAsync(projectId)).Select(ToVersionDto);

    public async Task<WbsVersionDto> CreateVersionAsync(CreateWbsVersionDto dto)
    {
        var version = new WbsVersion
        {
            ProjectId = dto.ProjectId,
            VersionName = dto.VersionName,
            Description = dto.Description
        };
        return ToVersionDto(await repo.CreateVersionAsync(version));
    }

    public async Task SetCurrentVersionAsync(int projectId, int versionId) =>
        await repo.SetCurrentVersionAsync(projectId, versionId);

    private static WbsItemDto ToDto(WbsItem item, IEnumerable<WbsItem> all) => new(
        item.Id, item.ProjectId, item.VersionId, item.ParentId,
        item.Name, item.Assignee, item.StartDate, item.EndDate,
        item.Status, item.IsMilestone, item.Order, item.Notes,
        item.CreatedAt, item.UpdatedAt,
        item.Children?.Select(c => ToDto(c, all)));

    private static WbsVersionDto ToVersionDto(WbsVersion v) => new(
        v.Id, v.ProjectId, v.VersionName, v.Description, v.CreatedAt, v.IsCurrent);
}
