using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

public record ChangeLogDto(
    int Id, int ProjectId, DateTime Date,
    string Content, ImpactLevel Impact,
    string RelatedDocLinks,
    int? SourceIssueId, string? SourceIssueTitle,
    int? SourceWbsItemId, string? SourceWbsItemName,
    string CreatedBy, string UpdatedBy,
    DateTime CreatedAt, DateTime UpdatedAt);

public record CreateChangeLogDto(
    int ProjectId, DateTime Date, string Content,
    ImpactLevel Impact, string RelatedDocLinks,
    int? SourceIssueId, int? SourceWbsItemId);

public record UpdateChangeLogDto(
    DateTime Date, string Content,
    ImpactLevel Impact, string RelatedDocLinks,
    int? SourceIssueId, int? SourceWbsItemId);
