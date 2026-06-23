namespace ProjectManager.Core.DTOs;

// 주의(Attention) 피드 1건 — 기존 집계를 합성한 요약 알림. 제목은 Kind 로 프런트에서 i18n.
// Kind: overdue | overallocated | dueSoon | unassigned | milestone | stale.
// Severity: high | medium | low. Link: 클릭 시 이동/탭 전환 힌트(프런트 해석).
public record AttentionItemDto(string Kind, string Severity, int Count, string Link);

// 룰 없는 계산형 피드 — 영속·이메일 없음. 로컬 우선 단독 운영자(관리자) 의 '지금 봐야 할 것' 한눈에.
public record AttentionFeedDto(IReadOnlyList<AttentionItemDto> Items, int HighCount);
