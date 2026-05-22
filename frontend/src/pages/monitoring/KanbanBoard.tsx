import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCorners, useDraggable, useDroppable,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { Star } from 'lucide-react';
import { monitoringApi } from '../../api/monitoring';
import { Badge, Card, EmptyState, Spinner } from '../../components/ui';
import { issuePriorityBadge } from '../../utils/statusMaps';
import { getProjectColor } from '../../utils/projectColor';
import { useThemeMode, type ThemeMode } from '../../utils/themeColors';
import type { IssuePriority, KanbanColumn, KanbanItem } from '../../types';

const COLUMNS: { key: KanbanColumn; label: string; note?: string }[] = [
  { key: 'todo',  label: '예정' },
  { key: 'doing', label: '진행 중' },
  { key: 'done',  label: '완료', note: '최근 2주' },
];

type KindFilter = 'all' | 'wbs' | 'issue';
const KIND_FILTERS: { key: KindFilter; label: string }[] = [
  { key: 'all',   label: '전체' },
  { key: 'wbs',   label: 'WBS' },
  { key: 'issue', label: '이슈' },
];

const cardId = (it: KanbanItem) => `${it.kind}-${it.id}`;

function statusToColumn(it: KanbanItem): KanbanColumn {
  if (it.kind === 'wbs') return it.status === 'Done' ? 'done' : it.status === 'InProgress' ? 'doing' : 'todo';
  return it.status === 'Resolved' || it.status === 'Closed' ? 'done' : it.status === 'InProgress' ? 'doing' : 'todo';
}

// 컬럼 드롭 시 부여할 대표 상태 (이슈 완료는 Resolved — Closed 는 이슈 페이지 수동).
function columnToStatus(kind: KanbanItem['kind'], col: KanbanColumn): string {
  if (kind === 'wbs') return col === 'todo' ? 'Planned' : col === 'doing' ? 'InProgress' : 'Done';
  return col === 'todo' ? 'Open' : col === 'doing' ? 'InProgress' : 'Resolved';
}

export function KanbanBoard() {
  const navigate = useNavigate();
  const theme = useThemeMode();
  const [items, setItems] = useState<KanbanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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

  const visible = useMemo(
    () => (kindFilter === 'all' ? items : items.filter((i) => i.kind === kindFilter)),
    [items, kindFilter],
  );

  const byColumn = useMemo(() => {
    const map: Record<KanbanColumn, KanbanItem[]> = { todo: [], doing: [], done: [] };
    for (const it of visible) map[statusToColumn(it)].push(it);
    return map;
  }, [visible]);

  const itemPath = (it: KanbanItem) =>
    it.kind === 'wbs'
      ? `/projects/${it.projectId}/wbs?highlight=${it.id}`
      : `/projects/${it.projectId}/issues?highlight=${it.id}`;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const col = over.id as KanbanColumn;
    const it = items.find((x) => cardId(x) === active.id);
    if (!it || statusToColumn(it) === col) return;

    const newStatus = columnToStatus(it.kind, col);
    const prev = items;
    setItems((cur) => cur.map((x) => (cardId(x) === active.id ? { ...x, status: newStatus } : x)));
    try {
      await monitoringApi.moveKanban(it.kind, it.id, col);
    } catch {
      setItems(prev); // 409 등은 api client 가 토스트
    }
  };

  const activeItem = activeId ? items.find((x) => cardId(x) === activeId) ?? null : null;

  if (loading) return <Spinner label="불러오는 중..." />;
  if (items.length === 0) {
    return <EmptyState icon={<Star size={32} />} title="보드에 표시할 작업이 없습니다." />;
  }

  return (
    <div className="space-y-3">
      <KindFilterBar value={kindFilter} onChange={setKindFilter} />
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
          {COLUMNS.map((c) => (
            <Column key={c.key} column={c.key} label={c.label} note={c.note} count={byColumn[c.key].length}>
              {byColumn[c.key].map((it) => (
                <KanbanCard key={cardId(it)} item={it} theme={theme} onOpen={() => navigate(itemPath(it))} />
              ))}
            </Column>
          ))}
        </div>
        <DragOverlay>
          {activeItem ? <CardBody item={activeItem} theme={theme} dragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function KindFilterBar({ value, onChange }: { value: KindFilter; onChange: (v: KindFilter) => void }) {
  return (
    <div className="inline-flex rounded-md border border-default bg-surface p-0.5">
      {KIND_FILTERS.map((f) => {
        const active = f.key === value;
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onChange(f.key)}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              active ? 'bg-accent text-on-accent font-medium' : 'text-secondary hover:text-primary hover:bg-surface-2'
            }`}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

function Column({
  column, label, note, count, children,
}: {
  column: KanbanColumn;
  label: string;
  note?: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-md border p-2 min-h-[160px] transition-colors ${
        isOver ? 'border-accent bg-surface-2' : 'border-default bg-surface'
      }`}
    >
      <div className="flex items-center justify-between px-1 mb-2">
        <h3 className="text-sm font-semibold text-primary">
          {label} <span className="text-muted font-normal">{count}</span>
        </h3>
        {note && <span className="text-[10px] text-muted">{note}</span>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function KanbanCard({ item, theme, onOpen }: { item: KanbanItem; theme: ThemeMode; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: cardId(item) });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
    >
      <CardBody item={item} theme={theme} />
    </div>
  );
}

function CardBody({ item, theme, dragging }: { item: KanbanItem; theme: ThemeMode; dragging?: boolean }) {
  const pc = getProjectColor(item.projectId, theme);
  const pri = item.kind === 'issue' && item.priority ? issuePriorityBadge[item.priority as IssuePriority] : null;
  return (
    <Card padding="none" className={`p-2 ${dragging ? 'shadow-lg' : ''}`}>
      <div className="flex items-start gap-1.5">
        {item.isMilestone ? (
          <Star size={12} className="shrink-0 mt-0.5 text-on-warning" />
        ) : (
          <span className={`shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${item.kind === 'wbs' ? 'bg-accent' : 'bg-warning'}`} />
        )}
        <span className="text-sm text-primary leading-snug break-words">{item.title}</span>
      </div>
      <div className="flex items-center flex-wrap gap-1 mt-1.5 pl-3">
        <span
          className="text-[10px] px-1.5 py-0.5 rounded truncate max-w-[10rem]"
          style={{ backgroundColor: pc.bg, color: pc.text }}
          title={item.projectName}
        >
          {pc.glyph} {item.projectName}
        </span>
        {pri && <Badge variant={pri.variant} size="sm">{pri.label}</Badge>}
        {item.dueDate && <span className="text-[10px] text-on-warning">{item.dueDate.slice(0, 10)}</span>}
      </div>
    </Card>
  );
}
