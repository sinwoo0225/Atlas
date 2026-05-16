using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

public record ChangeLogDto(
    int Id, int ProjectId, DateTime Date,
    string Content, ImpactLevel Impact,
    string RelatedDocLinks,
    string CreatedBy, string UpdatedBy,
    DateTime CreatedAt, DateTime UpdatedAt);

public record CreateChangeLogDto(
    int ProjectId, DateTime Date, string Content,
    ImpactLevel Impact, string RelatedDocLinks);

public record UpdateChangeLogDto(
    DateTime Date, string Content,
    ImpactLevel Impact, string RelatedDocLinks);
