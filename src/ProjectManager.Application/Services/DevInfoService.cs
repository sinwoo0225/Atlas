using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;
using ProjectManager.Infrastructure.FileStorage;

namespace ProjectManager.Application.Services;

public class DevInfoService(IDevInfoRepository repo, IProjectRepository projectRepo, DevFilesStorage fileStorage)
{
    public async Task<IEnumerable<DevInfoItemDto>> GetByProjectAsync(int projectId) =>
        (await repo.GetByProjectAsync(projectId)).Select(ToDto);

    public async Task<DevInfoItemDto?> GetByIdAsync(int id)
    {
        var item = await repo.GetByIdAsync(id);
        return item is null ? null : ToDto(item);
    }

    public async Task<DevInfoItemDto> CreateAsync(CreateDevInfoItemDto dto)
    {
        var item = new DevInfoItem
        {
            ProjectId = dto.ProjectId, Title = dto.Title,
            Type = dto.Type, Content = dto.Content,
            FilePath = dto.FilePath, Url = dto.Url, Tags = dto.Tags
        };

        if (item.Type == DevInfoType.Markdown)
        {
            var saved = await SaveMarkdownAsync(item);
            if (!string.IsNullOrEmpty(saved)) item.FilePath = saved;
        }

        return ToDto(await repo.CreateAsync(item));
    }

    public async Task<DevInfoItemDto?> UpdateAsync(int id, UpdateDevInfoItemDto dto)
    {
        var item = await repo.GetByIdAsync(id);
        if (item is null) return null;
        item.Title = dto.Title; item.Type = dto.Type;
        item.Content = dto.Content; item.FilePath = dto.FilePath;
        item.Url = dto.Url; item.Tags = dto.Tags;

        if (item.Type == DevInfoType.Markdown)
        {
            var saved = await SaveMarkdownAsync(item);
            if (!string.IsNullOrEmpty(saved)) item.FilePath = saved;
        }

        return ToDto(await repo.UpdateAsync(item));
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var item = await repo.GetByIdAsync(id);
        if (item is null) return false;
        if (!string.IsNullOrEmpty(item.FilePath))
            fileStorage.DeleteFile(item.FilePath);
        await repo.DeleteAsync(id);
        return true;
    }

    public void OpenFile(string filePath) => fileStorage.OpenFile(filePath);

    private async Task<string?> SaveMarkdownAsync(DevInfoItem item)
    {
        var project = await projectRepo.GetByIdAsync(item.ProjectId);
        if (project is null || string.IsNullOrEmpty(project.FolderPath)) return null;

        try
        {
            Directory.CreateDirectory(project.FolderPath);
            var safeTitle = string.Concat((item.Title ?? "untitled").Split(Path.GetInvalidFileNameChars())).Trim();
            if (string.IsNullOrWhiteSpace(safeTitle)) safeTitle = $"devinfo_{item.Id}";
            var filePath = Path.Combine(project.FolderPath, $"{safeTitle}.md");
            await File.WriteAllTextAsync(filePath, item.Content ?? string.Empty);
            return filePath;
        }
        catch
        {
            return null;
        }
    }

    private static DevInfoItemDto ToDto(DevInfoItem d) => new(
        d.Id, d.ProjectId, d.Title, d.Type, d.Content,
        d.FilePath, d.Url, d.Tags, d.CreatedAt, d.UpdatedAt);
}
