import type { WbsItem } from '../types';

// 사이클 14 — WBS 형제 정렬 단일 진실. sortOrder asc + id tiebreak (안정).
// 표·간트·dnd-kit 모두 이 헬퍼만 사용 → 뷰 간 정렬 불일치 원천 차단.
export function compareSiblings(a: WbsItem, b: WbsItem): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.id - b.id;
}

export function sortSiblings(items: WbsItem[]): WbsItem[] {
  return [...items].sort(compareSiblings);
}

// 트리 전체를 형제 그룹 단위로 재귀 정렬. children 도 함께.
export function sortWbsTree(items: WbsItem[]): WbsItem[] {
  return sortSiblings(items).map((it) => ({
    ...it,
    children: it.children?.length ? sortWbsTree(it.children) : it.children,
  }));
}
