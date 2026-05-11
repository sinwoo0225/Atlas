using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;

namespace ProjectManager.Application.Services;

public class ChangeLogService(IChangeLogRepository repo)
{
    public async Task<IEnumerable<ChangeLogDto>> GetByProjectAsync(int projectId) =>
        (await repo.GetByProjectAsync(projectId)).Select(ToDto);

    public async Task<ChangeLogDto?> GetByIdAsync(int id)
    {
        var item = await repo.GetByIdAsync(id);
        return item is null ? null : ToDto(item);
    }

    public async Task<ChangeLogDto> CreateAsync(CreateChangeLogDto dto)
    {
        var log = new ChangeLog
        {
            ProjectId = dto.ProjectId, Date = dto.Date,
            Content = dto.Content, Impact = dto.Impact,
            RelatedDocLinks = dto.RelatedDocLinks, Author = dto.Author
        };
        return ToDto(await repo.CreateAsync(log));
    }

    public async Task<ChangeLogDto?> UpdateAsync(int id, UpdateChangeLogDto dto)
    {
        var log = await repo.GetByIdAsync(id);
        if (log is null) return null;
        log.Date = dto.Date; log.Content = dto.Content;
        log.Impact = dto.Impact; log.RelatedDocLinks = dto.RelatedDocLinks;
        log.Author = dto.Author;
        return ToDto(await repo.UpdateAsync(log));
    }

    public async Task<bool> DeleteAsync(int id)
    {
        if (await repo.GetByIdAsync(id) is null) return false;
        await repo.DeleteAsync(id);
        return true;
    }

    private static ChangeLogDto ToDto(ChangeLog c) => new(
        c.Id, c.ProjectId, c.Date, c.Content, c.Impact,
        c.RelatedDocLinks, c.Author, c.CreatedAt, c.UpdatedAt);
}
