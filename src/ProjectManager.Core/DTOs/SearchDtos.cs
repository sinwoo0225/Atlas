namespace ProjectManager.Core.DTOs;

// 글로벌 검색 결과 행. Type 은 엔티티 타입 문자열 — 프론트 라우팅 분기에 사용.
// Title / Snippet 은 <mark>...</mark> 하이라이트 포함 가능 (FTS5 의 highlight/snippet 산출물).
public record SearchHit(
    string Type,
    int Id,
    int? ProjectId,
    string? ProjectName,
    string Title,
    string Snippet,
    DateTime UpdatedAt
);
