import { arrayMove } from '@dnd-kit/sortable';
import type { WbsItem } from '../../types';

export interface ReorderPatch {
  id: number;
  newOrder: number;
  prevOrder: number;
  updatedAt: string;
}

// 같은 부모 형제 그룹에서 activeId 를 overId 자리로 이동. 변경된 형제만 반환.
// order 는 내림차순 정렬 (siblingSort) 이라 visual idx 의 역수로 재할당 — 맨 위가 가장 큰 order.
export function computeSiblingReorder(
  siblings: WbsItem[],
  activeId: number,
  overId: number,
): ReorderPatch[] {
  const visual = [...siblings].sort((a, b) => b.order - a.order);
  const oldIdx = visual.findIndex((s) => s.id === activeId);
  const newIdx = visual.findIndex((s) => s.id === overId);
  if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return [];

  const moved = arrayMove(visual, oldIdx, newIdx);
  const n = moved.length;
  const patches: ReorderPatch[] = [];
  moved.forEach((sib, idx) => {
    const newOrder = n - 1 - idx;
    if (sib.order !== newOrder) {
      patches.push({
        id: sib.id,
        newOrder,
        prevOrder: sib.order,
        updatedAt: sib.updatedAt,
      });
    }
  });
  return patches;
}
