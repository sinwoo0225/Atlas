import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { KanbanBoardView, type KanbanStatusColumn } from '../../components/kanban/KanbanBoardView';
import type { KanbanItem, WbsItem, WbsStatus } from '../../types';

// 프로젝트 일정/WBS 칸반 — 통합 모니터링 칸반(KanbanBoardView) 재활용.
// 리프 작업만 카드로(부모는 집계 노드). 상태축 5컬럼(예정·대기·진행·완료·중단) 1:1 매핑, 담당자 그룹 지원. 이슈 미포함.
const WBS_STATUS_ORDER: WbsStatus[] = ['Planned', 'Waiting', 'InProgress', 'Done', 'Suspended'];

function collectLeaves(items: WbsItem[], out: WbsItem[] = []): WbsItem[] {
  for (const it of items) {
    if (it.children && it.children.length > 0) collectLeaves(it.children, out);
    else out.push(it);
  }
  return out;
}

interface Props {
  items: WbsItem[];
  onMoveStatus: (id: number, status: WbsStatus) => Promise<void>;
  onOpen: (item: WbsItem) => void;
}

export function WbsKanban({ items, onMoveStatus, onOpen }: Props) {
  const { t } = useTranslation();

  const leaves = useMemo(() => collectLeaves(items), [items]);
  const leafById = useMemo(() => new Map(leaves.map((l) => [l.id, l])), [leaves]);

  const cards: KanbanItem[] = useMemo(
    () => leaves.map((it) => ({
      kind: 'wbs',
      id: it.id,
      projectId: it.projectId,
      projectName: '',
      title: it.name,
      status: it.status,
      isMilestone: it.isMilestone,
      priority: null,
      assignee: it.assignee || null,
      dueDate: it.endDate ? it.endDate.slice(0, 10) : null,
    })),
    [leaves],
  );

  const statusColumns: KanbanStatusColumn[] = useMemo(
    () => WBS_STATUS_ORDER.map((s) => ({ id: s, label: t(`status:wbs.${s}`) })),
    [t],
  );

  return (
    <KanbanBoardView
      items={cards}
      statusColumns={statusColumns}
      itemStatusColumn={(it) => it.status}
      columnToStatus={(_it, col) => col}
      onMove={(it, _col, newStatus) => onMoveStatus(it.id, newStatus as WbsStatus)}
      onOpen={(it) => { const w = leafById.get(it.id); if (w) onOpen(w); }}
      groupDims={['status', 'assignee']}
      showKindFilter={false}
      showProjectTag={false}
    />
  );
}
