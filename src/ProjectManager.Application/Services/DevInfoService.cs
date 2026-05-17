using System.Text;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;
using ProjectManager.Infrastructure.Config;
using ProjectManager.Infrastructure.FileStorage;

namespace ProjectManager.Application.Services;

public class DevInfoService(
    IDevInfoRepository repo,
    IProjectRepository projectRepo,
    DevFilesStorage fileStorage,
    PathResolver pathResolver)
{
    public async Task<IEnumerable<DevInfoItemDto>> GetByProjectAsync(int projectId) =>
        (await repo.GetByProjectAsync(projectId)).Select(ToDto);

    // 프로젝트 안 DevInfo 의 콤마 Tags 컬럼에서 distinct 태그 list 반환.
    // SQLite 는 string split 불가 — Tags 문자열만 가져와 메모리에서 split·distinct·정렬.
    // 대소문자 무관 distinct (OrdinalIgnoreCase). sort: "alpha"(기본, 한글·영문 mixed CurrentCultureIgnoreCase)
    // 또는 "freq"(사용 빈도 내림차순, tie-breaker 는 alpha).
    public async Task<IReadOnlyList<string>> GetDistinctTagsAsync(int projectId, string? sort = null)
    {
        var tagsStrings = await repo.GetTagsByProjectAsync(projectId);
        var allTokens = tagsStrings
            .SelectMany(s => s.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
            .ToList();

        if (string.Equals(sort, "freq", StringComparison.OrdinalIgnoreCase))
        {
            // OrdinalIgnoreCase 로 그룹화한 뒤 첫 등장 표기 보존 — "API"/"api" 가 섞이면 첫 항목 표기.
            return allTokens
                .GroupBy(t => t, StringComparer.OrdinalIgnoreCase)
                .OrderByDescending(g => g.Count())
                .ThenBy(g => g.First(), StringComparer.CurrentCultureIgnoreCase)
                .Select(g => g.First())
                .ToList();
        }

        return allTokens
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(t => t, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
    }

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
            Type = dto.Type, StorageMode = dto.StorageMode,
            Content = dto.Content,
            FilePath = dto.FilePath, Url = dto.Url, Tags = dto.Tags
        };
        var created = await repo.CreateAsync(item);

        if (created.Type == DevInfoType.Markdown)
        {
            var saved = await SaveMarkdownAsync(created);
            if (!string.IsNullOrEmpty(saved))
            {
                created.FilePath = saved;
                await repo.UpdateAsync(created);
            }
        }
        return ToDto(created);
    }

    public async Task<DevInfoItemDto?> UpdateAsync(int id, UpdateDevInfoItemDto dto)
    {
        var item = await repo.GetByIdAsync(id);
        if (item is null) return null;
        var oldPath = item.FilePath;
        var oldType = item.Type;
        item.Title = dto.Title; item.Type = dto.Type;
        item.StorageMode = dto.StorageMode;
        item.Content = dto.Content; item.FilePath = dto.FilePath;
        item.Url = dto.Url; item.Tags = dto.Tags;
        var updated = await repo.UpdateAsync(item);

        if (updated.Type == DevInfoType.Markdown)
        {
            var saved = await SaveMarkdownAsync(updated);
            if (!string.IsNullOrEmpty(saved))
            {
                // 마크다운 항목의 이전 .md 파일이 새 경로와 다르면 삭제 (위치 이전·제목 변경 모두 커버).
                if (oldType == DevInfoType.Markdown
                    && !string.IsNullOrEmpty(oldPath)
                    && !string.Equals(oldPath, saved, StringComparison.OrdinalIgnoreCase))
                {
                    try { if (File.Exists(oldPath)) File.Delete(oldPath); } catch { }
                }
                updated.FilePath = saved;
                await repo.UpdateAsync(updated);
            }
        }
        return ToDto(updated);
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var item = await repo.GetByIdAsync(id);
        if (item is null) return false;
        if (!string.IsNullOrEmpty(item.FilePath))
        {
            // Markdown 과 Copy 모드 파일만 디스크에서 삭제. Reference 모드는 원본 보존.
            var shouldDelete = item.Type == DevInfoType.Markdown
                || (item.Type == DevInfoType.File && item.StorageMode == DevInfoStorageMode.Copy);
            if (shouldDelete) fileStorage.DeleteFile(item.FilePath);
        }
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
            var folder = pathResolver.GetDevInfoFolder(project.FolderPath);
            var safeTitle = string.Concat((item.Title ?? "untitled").Split(Path.GetInvalidFileNameChars())).Trim();
            if (string.IsNullOrWhiteSpace(safeTitle)) safeTitle = $"devinfo_{item.Id}";
            if (safeTitle.Length > 80) safeTitle = safeTitle[..80];
            var filePath = Path.Combine(folder, $"{safeTitle}.md");
            var content = BuildMarkdownContent(project, item);
            await File.WriteAllTextAsync(filePath, content, new UTF8Encoding(false));
            return filePath;
        }
        catch
        {
            return null;
        }
    }

    private static string BuildMarkdownContent(Project project, DevInfoItem item)
    {
        var sb = new StringBuilder();
        sb.AppendLine("---");
        sb.AppendLine("type: devinfo");
        sb.AppendLine($"id: {item.Id}");
        sb.AppendLine($"project: \"{(project.Name ?? string.Empty).Replace("\"", "\\\"")}\"");
        sb.AppendLine($"title: \"{(item.Title ?? string.Empty).Replace("\"", "\\\"")}\"");
        if (!string.IsNullOrWhiteSpace(item.Tags))
        {
            var tagList = item.Tags.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
            if (tagList.Length > 0)
            {
                var quoted = tagList.Select(t => "\"" + t.Replace("\"", "\\\"") + "\"");
                sb.AppendLine($"tags: [{string.Join(", ", quoted)}]");
            }
        }
        sb.AppendLine($"createdAt: {item.CreatedAt:yyyy-MM-ddTHH:mm:ssZ}");
        sb.AppendLine($"updatedAt: {item.UpdatedAt:yyyy-MM-ddTHH:mm:ssZ}");
        sb.AppendLine("---");
        sb.AppendLine();
        sb.AppendLine(item.Content ?? string.Empty);
        return sb.ToString();
    }

    private static DevInfoItemDto ToDto(DevInfoItem d) => new(
        d.Id, d.ProjectId, d.Title, d.Type, d.StorageMode, d.Content,
        d.FilePath, d.Url, d.Tags, d.CreatedAt, d.UpdatedAt);
}
