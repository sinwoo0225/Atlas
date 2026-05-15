using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

public record DevInfoItemDto(
    int Id, int ProjectId, string Title,
    DevInfoType Type, DevInfoStorageMode StorageMode,
    string Content,
    string FilePath, string Url, string Tags,
    DateTime CreatedAt, DateTime UpdatedAt);

public record CreateDevInfoItemDto(
    int ProjectId, string Title,
    DevInfoType Type, DevInfoStorageMode StorageMode,
    string Content,
    string FilePath, string Url, string Tags);

public record UpdateDevInfoItemDto(
    string Title, DevInfoType Type, DevInfoStorageMode StorageMode,
    string Content,
    string FilePath, string Url, string Tags);
