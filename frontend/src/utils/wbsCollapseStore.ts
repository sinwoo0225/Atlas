// WBS/일정 트리의 접힘(collapsed) 노드 id 집합을 프로젝트별로 보존. Set<number> 는 배열로 직렬화한다.
// wbsFilterStore 패턴 미러 — 단, 옵트인 없이 상시 저장(사이드바 접힘처럼 저비용 뷰 편의).
// 삭제된 노드의 잔여 id 는 무해(트리와 매칭 안 됨), 새 노드는 미포함=펼침 기본.
const keyOf = (projectId: number) => `atlas:wbsCollapsed:${projectId}`;

export function loadWbsCollapsed(projectId: number): Set<number> | null {
  try {
    const raw = localStorage.getItem(keyOf(projectId));
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return new Set(arr.filter((n): n is number => typeof n === 'number'));
  } catch {
    return null;
  }
}

export function saveWbsCollapsed(projectId: number, collapsed: Set<number>): void {
  try {
    localStorage.setItem(keyOf(projectId), JSON.stringify([...collapsed]));
  } catch {
    // ignore (quota/직렬화 실패)
  }
}

export function clearWbsCollapsed(projectId: number): void {
  try {
    localStorage.removeItem(keyOf(projectId));
  } catch {
    // ignore
  }
}
