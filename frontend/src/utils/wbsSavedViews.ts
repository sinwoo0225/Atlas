import type { StoredWbsFilters } from './wbsFilterStore';

// WBS/일정 필터의 명명 저장 뷰(프로젝트별). '필터 기억'(마지막 사용 복원)과 별개로, 명시적으로 저장/적용하는 뷰.
// StoredWbsFilters 형태를 그대로 재사용해 '필터 기억'과 상호운용.
export interface SavedWbsView {
  id: string;
  name: string;
  filters: StoredWbsFilters;
}

const keyOf = (projectId: number) => `atlas:wbsViews:${projectId}`;

export function listSavedViews(projectId: number): SavedWbsView[] {
  try {
    const raw = localStorage.getItem(keyOf(projectId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persist(projectId: number, views: SavedWbsView[]): void {
  try {
    localStorage.setItem(keyOf(projectId), JSON.stringify(views));
  } catch {
    // ignore (quota)
  }
}

// 같은 이름이면 덮어쓰기. 새 목록 반환.
export function saveView(projectId: number, name: string, filters: StoredWbsFilters): SavedWbsView[] {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const next = [...listSavedViews(projectId).filter((v) => v.name !== name), { id, name, filters }];
  persist(projectId, next);
  return next;
}

export function deleteView(projectId: number, id: string): SavedWbsView[] {
  const next = listSavedViews(projectId).filter((v) => v.id !== id);
  persist(projectId, next);
  return next;
}
