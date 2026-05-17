using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

public record ActivityLogDto(
    int Id,
    int? ProjectId,
    string? ProjectName,
    string EntityType,
    int EntityId,
    string EntityTitle,
    ActivityAction Action,
    string Actor,
    DateTime Timestamp,
    IReadOnlyDictionary<string, ActivityChangeValue>? ChangedFields);

public record ActivityChangeValue(string Old, string New);

// 전역 활동 피드 필터 — Controller 가 쿼리스트링에서 조립해 Service/Repo 로 패스.
// 다중값(EntityTypes/Actions/Actors)은 콤마 구분. 모든 필터는 null/빈 배열이면 미적용.
public record ActivityFilter(
    int? ProjectId,
    IReadOnlyList<string>? EntityTypes,
    IReadOnlyList<ActivityAction>? Actions,
    IReadOnlyList<string>? Actors,
    DateTime? FromUtc,
    DateTime? ToUtc,
    int Limit,
    int Offset);
