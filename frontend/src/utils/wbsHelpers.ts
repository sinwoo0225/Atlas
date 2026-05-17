import type { WbsItem } from '../types';

// 필터 조건. 빈 키워드/필터는 통과.
export interface WbsFilterOpts {
  kw: string;            // lowercase, trimmed
  unassigned: boolean;
  late: boolean;
  todayMs: number;       // Date.now() 기준 자정 ms (지연 비교용)
}

export function matchWbsItem(item: WbsItem, o: WbsFilterOpts): boolean {
  if (o.kw) {
    const hay = `${item.name} ${item.assignee} ${item.notes ?? ''}`.toLowerCase();
    if (!hay.includes(o.kw)) return false;
  }
  if (o.unassigned && item.assignee.trim()) return false;
  if (o.late) {
    if (!item.endDate) return false;
    if (item.status === 'Done') return false;
    if (new Date(item.endDate).getTime() >= o.todayMs) return false;
  }
  return true;
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
  return !!o.kw || o.unassigned || o.late;
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

// 사이클 13 — dnd-kit reorder 의 optimistic update. 지정 부모(또는 root) children 의 order 만 patches 대로 갱신.
// parentId === null 이면 루트 형제, 아니면 해당 부모의 children 안에서만 적용.
export function applyOrderPatchesLocal(
  items: WbsItem[],
  parentId: number | null,
  patches: { id: number; newOrder: number }[],
): WbsItem[] {
  const map = new Map(patches.map((p) => [p.id, p.newOrder]));
  function walk(nodes: WbsItem[], currentParentId: number | null): WbsItem[] {
    return nodes.map((n) => {
      const next = { ...n };
      if (currentParentId === parentId && map.has(n.id)) {
        next.order = map.get(n.id)!;
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
