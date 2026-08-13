import type { IssueSort, IssueSortKey, SortDirection } from './issueSort';

// 이슈 목록의 정렬 상태를 프로젝트별로 보존.
// wbsCollapseStore 패턴 미러 — 옵트인 없이 상시 저장(저비용 뷰 편의).
// 삭제된 커스텀 열을 가리키는 잔여 값은 무해(makeIssueComparator 가 기본 순서로 폴백).
const keyOf = (projectId: number) => `atlas:issueSort:${projectId}`;

export function loadIssueSort(projectId: number): IssueSort | null {
  try {
    const raw = localStorage.getItem(keyOf(projectId));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p.key !== 'string') return null;
    if (p.dir !== 'asc' && p.dir !== 'desc') return null;
    return { key: p.key as IssueSortKey, dir: p.dir as SortDirection };
  } catch {
    return null;
  }
}

export function saveIssueSort(projectId: number, sort: IssueSort | null): void {
  try {
    if (sort) localStorage.setItem(keyOf(projectId), JSON.stringify(sort));
    else localStorage.removeItem(keyOf(projectId));
  } catch {
    // ignore (quota/직렬화 실패)
  }
}
