// 즐겨찾기(별표) 항목을 목록 최상단으로 — 안정 정렬이라 같은 그룹 내 기존 순서는 유지.
export function favoritesFirst<T extends { isFavorite?: boolean }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
}
