import type { WbsStatus } from '../types';

// WBS/일정 필터의 프로젝트별 저장본. Set 은 배열로 직렬화한다.
// 전역 옵트인(settings.rememberWbsFilters)이 ON 일 때만 읽고/쓴다.
export interface StoredWbsFilters {
  statuses: WbsStatus[];
  assignees: string[];
  unassignedOnly: boolean;
  lateOnly: boolean;
  matchOnly: boolean;
}

const keyOf = (projectId: number) => `atlas:wbsFilters:${projectId}`;

export function loadWbsFilters(projectId: number): StoredWbsFilters | null {
  try {
    const raw = localStorage.getItem(keyOf(projectId));
    if (!raw) return null;
    const p = JSON.parse(raw);
    return {
      statuses: Array.isArray(p.statuses) ? p.statuses : [],
      assignees: Array.isArray(p.assignees) ? p.assignees : [],
      unassignedOnly: !!p.unassignedOnly,
      lateOnly: !!p.lateOnly,
      matchOnly: !!p.matchOnly,
    };
  } catch {
    return null;
  }
}

export function saveWbsFilters(projectId: number, f: StoredWbsFilters): void {
  try {
    localStorage.setItem(keyOf(projectId), JSON.stringify(f));
  } catch {
    // ignore (quota/직렬화 실패)
  }
}

export function clearWbsFilters(projectId: number): void {
  try {
    localStorage.removeItem(keyOf(projectId));
  } catch {
    // ignore
  }
}
