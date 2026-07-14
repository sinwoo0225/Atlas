import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { monitoringApi } from '../../api/monitoring';
import { Spinner } from '../../components/ui';
import { KanbanBoardView, type KanbanStatusColumn } from '../../components/kanban/KanbanBoardView';
import { isClosedWbs } from '../../utils/wbsHelpers';
import type { KanbanColumn, KanbanItem, WbsStatus } from '../../types';

// 상태축 — WBS+이슈 통합이라 todo/doing/done 3컬럼으로 정규화.
// 마지막 컬럼은 '종료' 축이다: 이슈는 Resolved 와 Closed 를 함께 넣는다. WBS 도 같은 규칙으로
// 중단(Suspended = 종료·비완료)을 여기 넣어야 한다 — 안 그러면 중단 항목이 '예정' 컬럼으로 떨어져
// 아직 할 일처럼 보인다(백엔드는 최근 종료 항목을 의도적으로 보드에 실어 보낸다).
function statusToColumn(it: KanbanItem): KanbanColumn {
  if (it.kind === 'wbs')
    return isClosedWbs(it.status as WbsStatus) ? 'done' : it.status === 'InProgress' ? 'doing' : 'todo';
  return it.status === 'Resolved' || it.status === 'Closed' ? 'done' : it.status === 'InProgress' ? 'doing' : 'todo';
}

// 컬럼 드롭 시 부여할 대표 상태 (이슈 완료는 Resolved — Closed 는 이슈 페이지 수동).
function columnToStatus(kind: KanbanItem['kind'], col: KanbanColumn): string {
  if (kind === 'wbs') return col === 'todo' ? 'Planned' : col === 'doing' ? 'InProgress' : 'Done';
  return col === 'todo' ? 'Open' : col === 'doing' ? 'InProgress' : 'Resolved';
}

export function KanbanBoard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<KanbanItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    monitoringApi
      .getKanban()
      .then((data) => { if (active) setItems(data); })
      .catch(() => { if (active) setItems([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const statusColumns: KanbanStatusColumn[] = useMemo(() => [
    { id: 'todo',  label: t('monitoring:kanban.colTodo') },
    { id: 'doing', label: t('monitoring:kanban.colDoing') },
    { id: 'done',  label: t('monitoring:kanban.colDone'), note: t('monitoring:kanban.doneNote') },
  ], [t]);

  const itemPath = (it: KanbanItem) =>
    it.kind === 'wbs'
      ? `/projects/${it.projectId}/wbs?highlight=${it.id}`
      : `/projects/${it.projectId}/issues?highlight=${it.id}`;

  if (loading) return <Spinner label={t('common:loading')} />;

  return (
    <KanbanBoardView
      items={items}
      statusColumns={statusColumns}
      itemStatusColumn={statusToColumn}
      columnToStatus={(it, col) => columnToStatus(it.kind, col as KanbanColumn)}
      onMove={(it, col) => monitoringApi.moveKanban(it.kind, it.id, col as KanbanColumn)}
      onOpen={(it) => navigate(itemPath(it))}
    />
  );
}
