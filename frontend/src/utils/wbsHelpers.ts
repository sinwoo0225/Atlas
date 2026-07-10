import type { WbsItem, WbsStatus } from '../types';

// 콤마 구분 담당자 문자열을 개인 단위로 분리. 빈 토큰은 제거.
export function splitAssignees(raw: string | null | undefined): string[] {
  return (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

// 종료 상태 집합 = 완료(Done) + 중단(Suspended). '잔여/active' 판정·완료율 분모·지연 대상에서 제외한다.
// (중단은 종료지만 '완료'는 아니다 — 완료 카운트는 Status==='Done' 만.)
export const isClosedWbs = (s: WbsStatus): boolean => s === 'Done' || s === 'Suspended';
export const isActiveWbs = (s: WbsStatus): boolean => !isClosedWbs(s);

// 필터 조건. 빈 키워드/필터는 통과.
export interface WbsFilterOpts {
  kw: string;                  // lowercase, trimmed
  unassigned: boolean;
  late: boolean;
  overdueStart: boolean;       // 계획 시작일이 지났는데 아직 Planned(미착수)
  statuses: Set<WbsStatus>;    // 비어있으면 전체 통과
  assignees: Set<string>;      // 개인 단위. 비어있으면 전체 통과
  todayMs: number;             // Date.now() 기준 자정 ms (지연 비교용)
}

export function matchWbsItem(item: WbsItem, o: WbsFilterOpts): boolean {
  if (o.kw) {
    const hay = `${item.name} ${item.assignee} ${item.notes ?? ''}`.toLowerCase();
    if (!hay.includes(o.kw)) return false;
  }
  if (o.unassigned && item.assignee.trim()) return false;
  if (o.statuses.size > 0 && !o.statuses.has(item.status)) return false;
  if (o.assignees.size > 0) {
    const own = splitAssignees(item.assignee);
    if (!own.some((a) => o.assignees.has(a))) return false;
  }
  if (o.late) {
    if (!item.endDate) return false;
    if (isClosedWbs(item.status)) return false; // 완료·중단은 지연 대상 아님
    if (new Date(item.endDate).getTime() >= o.todayMs) return false;
  }
  if (o.overdueStart) {
    if (item.status !== 'Planned') return false;
    if (!item.startDate) return false;
    if (new Date(item.startDate).getTime() > o.todayMs) return false;
  }
  return true;
}

// 중첩 트리를 깊이(depth) 와 함께 평탄화. 선행 작업 후보 등 전체 노드를 한 줄 목록으로
// 노출할 때 사용 (allItems 는 root 만 최상위라 단순 순회로는 자식이 안 보임).
export function flattenWbsTree(items: WbsItem[]): { item: WbsItem; depth: number }[] {
  const out: { item: WbsItem; depth: number }[] = [];
  const walk = (nodes: WbsItem[], depth: number) => {
    for (const n of nodes) {
      out.push({ item: n, depth });
      if (n.children?.length) walk(n.children, depth + 1);
    }
  };
  walk(items, 0);
  return out;
}

// 접기 가능한(자식 보유) 부모 노드 id 집합. 트리 접기 컨트롤용.
// level 미지정 → 모든 부모(= 모두 접기, 최상위만 표시).
// level=N → depth(0-based) >= N-1 인 부모만 → 표시 레벨 N까지 남기고 그 아래를 접음.
//   (level=1 = 모두 접기, level=2 = 2레벨까지 표시, …)
export function collectCollapsibleIds(items: WbsItem[], level?: number): Set<number> {
  const ids = new Set<number>();
  for (const { item, depth } of flattenWbsTree(items)) {
    const hasChildren = (item.children?.length ?? 0) > 0;
    if (hasChildren && (level === undefined || depth >= level - 1)) ids.add(item.id);
  }
  return ids;
}

export function collectMatchedIds(items: WbsItem[], o: WbsFilterOpts, acc: Set<number> = new Set()): Set<number> {
  for (const item of items) {
    if (matchWbsItem(item, o)) acc.add(item.id);
    if (item.children?.length) collectMatchedIds(item.children, o, acc);
  }
  return acc;
}

// matchOnly=true 일 때 매칭 안 한 가지 제거. 조상은 후손이 매칭이면 살아남는다.
export function filterWbsTree(items: WbsItem[], o: WbsFilterOpts): WbsItem[] {
  const out: WbsItem[] = [];
  for (const item of items) {
    const children = item.children?.length ? filterWbsTree(item.children, o) : [];
    const self = matchWbsItem(item, o);
    if (self || children.length > 0) {
      out.push({ ...item, children });
    }
  }
  return out;
}

export function hasAnyFilter(o: WbsFilterOpts): boolean {
  return !!o.kw || o.unassigned || o.late || o.overdueStart || o.statuses.size > 0 || o.assignees.size > 0;
}

// 트리 전체를 순회하며 담당자를 개인 단위로 쪼개 unique 정렬 반환 (표 필터 칩용).
export function uniqueAssigneesSplit(items: WbsItem[]): string[] {
  const set = new Set<string>();
  const walk = (n: WbsItem) => {
    splitAssignees(n.assignee).forEach((a) => set.add(a));
    n.children?.forEach(walk);
  };
  items.forEach(walk);
  return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
}

// 자기 자신 + 모든 자손 id 집합. WbsTreePicker 의 excludeIds 계산에 사용 —
// 순환 참조 방지(자손을 부모로 지정 불가).
export function collectDescendantIds(rootId: number, items: WbsItem[]): Set<number> {
  const out = new Set<number>([rootId]);
  function walk(node: WbsItem) {
    out.add(node.id);
    node.children?.forEach(walk);
  }
  const root = findItem(rootId, items);
  if (root) walk(root);
  return out;
}

export function findItem(id: number, items: WbsItem[]): WbsItem | null {
  for (const it of items) {
    if (it.id === id) return it;
    if (it.children?.length) {
      const found = findItem(id, it.children);
      if (found) return found;
    }
  }
  return null;
}

// 노드 라벨 (picker / 안내 토스트 표시용).
export function findItemName(id: number | null | undefined, items: WbsItem[]): string {
  if (id == null) return '(루트)';
  return findItem(id, items)?.name ?? `#${id}`;
}

// 사이클 13/14 — dnd-kit reorder 의 optimistic update. 지정 부모(또는 root) children 의 sortOrder 만 patches 대로 갱신.
// parentId === null 이면 루트 형제, 아니면 해당 부모의 children 안에서만 적용.
export function applySortOrderPatchesLocal(
  items: WbsItem[],
  parentId: number | null,
  patches: { id: number; newSortOrder: number }[],
): WbsItem[] {
  const map = new Map(patches.map((p) => [p.id, p.newSortOrder]));
  function walk(nodes: WbsItem[], currentParentId: number | null): WbsItem[] {
    return nodes.map((n) => {
      const next = { ...n };
      if (currentParentId === parentId && map.has(n.id)) {
        next.sortOrder = map.get(n.id)!;
      }
      if (n.children?.length) next.children = walk(n.children, n.id);
      return next;
    });
  }
  return walk(items, null);
}

// id 의 모든 조상 id 를 수집 (검색 매칭 노드 자동 expand 용).
export function collectAncestorIds(targetId: number, items: WbsItem[]): Set<number> {
  const out = new Set<number>();
  function walk(node: WbsItem, ancestors: number[]): boolean {
    if (node.id === targetId) {
      ancestors.forEach((a) => out.add(a));
      return true;
    }
    if (node.children?.length) {
      for (const c of node.children) {
        if (walk(c, [...ancestors, node.id])) return true;
      }
    }
    return false;
  }
  for (const root of items) walk(root, []);
  return out;
}
