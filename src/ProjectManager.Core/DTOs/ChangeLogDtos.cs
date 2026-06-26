using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

public record ChangeLogDto(
    int Id, int ProjectId, DateTime Date,
    string Content, ImpactLevel Impact,
    string RelatedDocLinks,
    int? SourceIssueId, string? SourceIssueTitle,
    int? SourceWbsItemId, string? SourceWbsItemName,
    string CreatedBy, string UpdatedBy,
    DateTime CreatedAt, DateTime UpdatedAt,
    bool IsFavorite = false);

public record CreateChangeLogDto(
    int ProjectId, DateTime Date, string Content,
    ImpactLevel Impact, string RelatedDocLinks,
    int? SourceIssueId, int? SourceWbsItemId);

public record UpdateChangeLogDto(
    DateTime Date, string Content,
    ImpactLevel Impact, string RelatedDocLinks,
    int? SourceIssueId, int? SourceWbsItemId,
    DateTime UpdatedAt);

// 역방향 카운트 — Issue/WBS 행에 "이 항목이 출처인 변경이력 N건" 배지용.
public record ChangeLogSourceCountsDto(
    IReadOnlyDictionary<int, int> ByIssueId,
    IReadOnlyDictionary<int, int> ByWbsItemId);
