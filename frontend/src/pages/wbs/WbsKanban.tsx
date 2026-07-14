import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { KanbanBoardView, type KanbanStatusColumn } from '../../components/kanban/KanbanBoardView';
import { isTaskWbs } from '../../utils/wbsHelpers';
import type { KanbanItem, WbsItem, WbsStatus } from '../../types';

// 프로젝트 일정/WBS 칸반 — 통합 모니터링 칸반(KanbanBoardView) 재활용.
// 작업(Task)만 카드로. 상태축 5컬럼(예정·대기·진행·완료·중단) 1:1 매핑, 담당자 그룹 지원. 이슈 미포함.
const WBS_STATUS_ORDER: WbsStatus[] = ['Planned', 'Waiting', 'InProgress', 'Done', 'Suspended'];

// 그룹은 카드로 만들지 않는다(상태가 파생값이라 드래그로 바꿀 게 없다). 자식이 있어도 Task 면 카드로 낸다 —
// 그게 '상위 작업' 이다. 그룹이어도 그 아래로는 계속 내려가야 자손 작업을 놓치지 않는다.
function collectTasks(items: WbsItem[], out: WbsItem[] = []): WbsItem[] {
  for (const it of items) {
    if (isTaskWbs(it)) out.push(it);
    if (it.children?.length) collectTasks(it.children, out);
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

  const leaves = useMemo(() => collectTasks(items), [items]);
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
