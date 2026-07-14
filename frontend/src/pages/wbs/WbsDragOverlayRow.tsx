import { GripVertical, Diamond, FolderTree } from 'lucide-react';
import { isGroupWbs } from '../../utils/wbsHelpers';
import type { WbsItem } from '../../types';

// DragOverlay 는 body 직속 portal — table CSS 컨텍스트 잃음.
// 단순 <div> 로 "행이 떠 있다" 시각 단서만 제공.
export function WbsDragOverlayRow({ item }: { item: WbsItem }) {
  const isGroup = isGroupWbs(item);
  return (
    <div className="shadow-elevated rounded-md bg-surface-2 border border-default px-4 py-2 flex items-center gap-2 rotate-1">
      <GripVertical size={14} className="text-muted" />
      {/* 그룹은 마일스톤과 배타 — 행 표시와 같은 규칙. */}
      {isGroup ? <FolderTree size={12} className="text-muted" /> : item.isMilestone && <Diamond size={12} className="text-accent" />}
      <span className="text-sm font-medium text-primary">{item.name}</span>
    </div>
  );
}
