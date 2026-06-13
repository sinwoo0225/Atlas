using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.Application.Services;

public class ResourceService(IResourceRepository repo, AppDbContext db)
{
    public async Task<IEnumerable<ResourceDto>> GetAllAsync(ResourceListFilter? filter = null) =>
        (await repo.GetAllAsync(filter)).Select(ToDto);

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

    // '나' 신원 통일 — 설정의 내 이름으로 Person 리소스를 찾고(대소문자 무시), 없으면 생성해 반환.
    // 작성자(defaultAuthor)·담당자·회고 주체를 단일 Resource 로 묶기 위한 진입점. 멱등.
    public async Task<ResourceDto> GetOrCreateByNameAsync(string name)
    {
        var trimmed = (name ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(trimmed))
            throw new ArgumentException("이름이 비어 있습니다.", nameof(name));
        var existing = (await repo.GetAllAsync())
            .FirstOrDefault(r => r.Type == ResourceType.Person
                && string.Equals(r.Name, trimmed, StringComparison.OrdinalIgnoreCase));
        if (existing is not null) return ToDto(existing);
        return ToDto(await repo.CreateAsync(new Resource { Name = trimmed, Type = ResourceType.Person }));
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

        // Assignee 는 콤마로 여러 명을 직렬화한 단일 문자열일 수 있다 ("Alice, Bob").
        // SQL Contains 로 후보를 추린 뒤, 메모리에서 콤마 split + 정확 일치로 false positive 제거.
        var candidates = await db.WbsItems
            .Where(w => w.Assignee != null && w.Assignee.Contains(name))
            .Join(db.Projects, w => w.ProjectId, p => p.Id, (w, p) => new { w, p })
            .OrderByDescending(x => x.w.UpdatedAt)
            .ToListAsync();

        var matched = candidates.Where(x =>
            x.w.Assignee
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => s.Trim())
                .Any(part => string.Equals(part, name, StringComparison.Ordinal)));

        return matched.Select(x => new ResourceAssignmentDto(
            x.w.Id, x.w.ProjectId, x.p.Name,
            x.w.Name, x.w.StartDate, x.w.EndDate, x.w.Status));
    }

    public static ResourceDto ToDto(Resource r) => new(
        r.Id, r.Name, r.Type,
        r.Department, r.Email, r.Phone, r.Notes,
        r.CreatedAt, r.UpdatedAt);
}
