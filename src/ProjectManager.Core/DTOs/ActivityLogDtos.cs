using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

public record ActivityLogDto(
    int Id,
    int? ProjectId,
    string EntityType,
    int EntityId,
    string EntityTitle,
    ActivityAction Action,
    string Actor,
    DateTime Timestamp);
