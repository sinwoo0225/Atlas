import { arrayMove } from '@dnd-kit/sortable';
import type { WbsItem } from '../../types';
import { sortSiblings } from '../../utils/wbsSort';

export interface ReorderPatch {
  id: number;
  newSortOrder: number;
  prevSortOrder: number;
  updatedAt: string;
}

// 사이클 14 — 단일 키(sortOrder asc). 그룹 분리 없음, 사용자 의도가 진실.
// visualIdx 그대로 newSortOrder 부여 (사이클 13 의 n-1-idx 역수 매핑 제거).
export function computeSiblingReorder(
  siblings: WbsItem[],
  activeId: number,
  overId: number,
): ReorderPatch[] {
  const visual = sortSiblings(siblings);
  const oldIdx = visual.findIndex((s) => s.id === activeId);
  const newIdx = visual.findIndex((s) => s.id === overId);
  if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return [];

  const moved = arrayMove(visual, oldIdx, newIdx);
  const patches: ReorderPatch[] = [];
  moved.forEach((sib, idx) => {
    if (sib.sortOrder !== idx) {
      patches.push({
        id: sib.id,
        newSortOrder: idx,
        prevSortOrder: sib.sortOrder,
        updatedAt: sib.updatedAt,
      });
    }
  });
  return patches;
}
