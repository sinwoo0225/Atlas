using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.Application.Services;

public class ResourceService(IResourceRepository repo, AppDbContext db)
{
    public async Task<IEnumerable<ResourceDto>> GetAllAsync() =>
        (await repo.GetAllAsync()).Select(ToDto);

    public async Task<ResourceDto?> GetByIdAsync(int id)
    {
        var r = await repo.GetByIdAsync(id);
        return r is null ? null : ToDto(r);
    }

    public async Task<ResourceDto> CreateAsync(CreateResourceDto dto)
    {
        var r = new Resource
        {
            Name = dto.Name,
            Type = dto.Type,
            Department = dto.Department,
            Email = dto.Email,
            Phone = dto.Phone,
            Notes = dto.Notes
        };
        return ToDto(await repo.CreateAsync(r));
    }

    public async Task<ResourceDto?> UpdateAsync(int id, UpdateResourceDto dto)
    {
        var r = await repo.GetByIdAsync(id);
        if (r is null) return null;
        r.Name = dto.Name;
        r.Type = dto.Type;
        r.Department = dto.Department;
        r.Email = dto.Email;
        r.Phone = dto.Phone;
        r.Notes = dto.Notes;
        return ToDto(await repo.UpdateAsync(r));
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var r = await repo.GetByIdAsync(id);
        if (r is null) return false;
        await repo.DeleteAsync(id);
        return true;
    }

    /// <summary>
    /// 리소스가 할당된 WBS 작업 목록을 조회 (assignee 필드와 이름 매칭).
    /// </summary>
    public async Task<IEnumerable<ResourceAssignmentDto>> GetAssignmentsAsync(int resourceId)
    {
        var resource = await repo.GetByIdAsync(resourceId);
        if (resource is null) return Enumerable.Empty<ResourceAssignmentDto>();

        var name = resource.Name;
        if (string.IsNullOrWhiteSpace(name)) return Enumerable.Empty<ResourceAssignmentDto>();

        var items = await db.WbsItems
            .Where(w => w.Assignee == name)
            .Join(db.Projects, w => w.ProjectId, p => p.Id, (w, p) => new { w, p })
            .OrderByDescending(x => x.w.UpdatedAt)
            .ToListAsync();

        return items.Select(x => new ResourceAssignmentDto(
            x.w.Id, x.w.ProjectId, x.p.Name,
            x.w.Name, x.w.StartDate, x.w.EndDate, x.w.Status));
    }

    public static ResourceDto ToDto(Resource r) => new(
        r.Id, r.Name, r.Type,
        r.Department, r.Email, r.Phone, r.Notes,
        r.CreatedAt, r.UpdatedAt);
}
