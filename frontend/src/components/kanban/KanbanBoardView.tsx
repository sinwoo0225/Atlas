import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCorners, useDraggable, useDroppable,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { Star } from 'lucide-react';
import { Badge, Card, EmptyState, FilterBar, Select } from '../ui';
import { issuePriorityBadge } from '../../utils/statusMaps';
import { getProjectColor } from '../../utils/projectColor';
import { parseAssigneeTokens } from '../../utils/assigneeTokens';
import { useThemeMode, type ThemeMode } from '../../utils/themeColors';
import type { IssuePriority, KanbanItem } from '../../types';

// 통합 모니터링 칸반과 프로젝트 일정/WBS 칸반이 공유하는 프레젠테이션 보드.
// 데이터 소스·상태축 매핑·이동 영속화는 컨테이너가 주입한다(여기선 그룹화·필터·DnD UX 만 담당).

export type KanbanGroupDim = 'status' | 'project' | 'assignee';
const ALL_GROUP_DIMS: KanbanGroupDim[] = ['status', 'project', 'assignee'];
const GROUP_DIM_LABEL: Record<KanbanGroupDim, string> = {
  status: 'monitoring:kanban.groupStatus',
  project: 'monitoring:kanban.groupProject',
  assignee: 'monitoring:kanban.groupAssignee',
};

type KindFilter = 'all' | 'wbs' | 'issue';
const KIND_FILTERS: { key: KindFilter; labelKey: string }[] = [
  { key: 'all',   labelKey: 'monitoring:kanban.filterAll' },
  { key: 'wbs',   labelKey: 'monitoring:kanban.filterWbs' },
  { key: 'issue', labelKey: 'monitoring:kanban.filterIssue' },
];

// 담당자 미지정 버킷/필터 센티넬 (실제 담당자명과 충돌하지 않는 제어문자 prefix).
const UNASSIGNED = ' unassigned';

interface ColumnDef {
  id: string;
  label: string;
  note?: string;
  glyph?: string;
  bg?: string;
  textColor?: string;
}

// 상태축 컬럼 정의 — 컨테이너가 제공(모니터링=todo/doing/done, WBS=예정/대기/진행/완료).
export interface KanbanStatusColumn { id: string; label: string; note?: string; }

export interface KanbanBoardViewProps {
  items: KanbanItem[];
  statusColumns: KanbanStatusColumn[];
  // 항목 → 상태 컬럼 id (어느 상태 컬럼에 놓일지).
  itemStatusColumn: (it: KanbanItem) => string;
  // 컬럼 id → 드롭 시 부여할 상태 문자열(영속화용).
  columnToStatus: (it: KanbanItem, columnId: string) => string;
  // 상태 컬럼으로 카드 드롭 시 영속화. 실패 시 throw → 낙관적 갱신 롤백.
  onMove: (it: KanbanItem, columnId: string, newStatus: string) => Promise<void>;
  onOpen: (it: KanbanItem) => void;
  groupDims?: KanbanGroupDim[];   // 기본 status·project·assignee
  showKindFilter?: boolean;       // 기본 true (WBS 전용 보드는 false)
  showProjectTag?: boolean;       // 기본 true (프로젝트 단위 보드는 false)
  emptyTitle?: string;
}

const cardId = (it: KanbanItem) => `${it.kind}-${it.id}`;

// 담당자 키 — WBS 는 콤마 분리 다중담당자(각 컬럼에 등장), 비면 미할당 버킷.
function itemAssigneeKeys(it: KanbanItem): string[] {
  const tokens = parseAssigneeTokens(it.assignee);
  return tokens.length > 0 ? tokens : [UNASSIGNED];
}

export function KanbanBoardView({
  items, statusColumns, itemStatusColumn, columnToStatus, onMove, onOpen,
  groupDims = ALL_GROUP_DIMS, showKindFilter = true, showProjectTag = true, emptyTitle,
}: KanbanBoardViewProps) {
  const { t } = useTranslation();
  const theme = useThemeMode();
  // 낙관적 DnD 를 위해 props.items 를 로컬로 보유하고 변경 시 동기화.
  const [local, setLocal] = useState<KanbanItem[]>(items);
  useEffect(() => { setLocal(items); }, [items]);

  const dims = groupDims.length > 0 ? groupDims : ALL_GROUP_DIMS;
  const [groupBy, setGroupBy] = useState<KanbanGroupDim>(dims.includes('status') ? 'status' : dims[0]);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleGroupChange = (g: KanbanGroupDim) => {
    setGroupBy(g);
    if (g === 'status') setStatusFilter('all');
    if (g === 'project') setProjectFilter('all');
    if (g === 'assignee') setAssigneeFilter('all');
  };

  // 필터 — groupBy 인 차원은 컬럼이므로 그 필터는 적용하지 않는다.
  const visible = useMemo(
    () => local.filter((it) => {
      if (showKindFilter && kindFilter !== 'all' && it.kind !== kindFilter) return false;
      if (groupBy !== 'status' && statusFilter !== 'all' && itemStatusColumn(it) !== statusFilter) return false;
      if (groupBy !== 'project' && projectFilter !== 'all' && String(it.projectId) !== projectFilter) return false;
      if (groupBy !== 'assignee' && assigneeFilter !== 'all' && !itemAssigneeKeys(it).includes(assigneeFilter)) return false;
      return true;
    }),
    [local, showKindFilter, kindFilter, statusFilter, projectFilter, assigneeFilter, groupBy, itemStatusColumn],
  );

  const { columns, byColumn } = useMemo(() => {
    const map: Record<string, KanbanItem[]> = {};
    const ensure = (id: string) => (map[id] ??= []);

    if (groupBy === 'status') {
      const cols: ColumnDef[] = statusColumns.map((c) => {
        map[c.id] = [];
        return { id: c.id, label: c.label, note: c.note };
      });
      for (const it of visible) {
        const col = itemStatusColumn(it);
        ensure(col).push(it);
      }
      return { columns: cols, byColumn: map };
    }

    if (groupBy === 'project') {
      const names = new Map<string, string>();
      for (const it of visible) {
        const id = String(it.projectId);
        if (!names.has(id)) names.set(id, it.projectName);
        ensure(id).push(it);
      }
      const cols: ColumnDef[] = [...names.keys()]
        .sort((a, b) => (names.get(a) ?? '').localeCompare(names.get(b) ?? ''))
        .map((id) => {
          const pc = getProjectColor(Number(id), theme);
          return { id, label: names.get(id) ?? id, glyph: pc.glyph, bg: pc.bg, textColor: pc.text };
        });
      return { columns: cols, byColumn: map };
    }

    // assignee
    let hasUnassigned = false;
    for (const it of visible) {
      for (const key of itemAssigneeKeys(it)) {
        if (key === UNASSIGNED) hasUnassigned = true;
        ensure(key).push(it);
      }
    }
    const cols: ColumnDef[] = Object.keys(map)
      .filter((k) => k !== UNASSIGNED)
      .sort((a, b) => a.localeCompare(b))
      .map((id) => ({ id, label: id }));
    if (hasUnassigned) cols.push({ id: UNASSIGNED, label: t('monitoring:kanban.unassigned') });
    return { columns: cols, byColumn: map };
  }, [visible, groupBy, theme, t, statusColumns, itemStatusColumn]);

  // 드롭다운 옵션은 전체 items 기준(필터로 줄어들어도 옵션은 안정적으로 유지).
  const projectOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const it of local) if (!names.has(String(it.projectId))) names.set(String(it.projectId), it.projectName);
    return [...names.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [local]);

  const assigneeOptions = useMemo(() => {
    const set = new Set<string>();
    let hasUnassigned = false;
    for (const it of local) for (const k of itemAssigneeKeys(it)) {
      if (k === UNASSIGNED) hasUnassigned = true; else set.add(k);
    }
    const arr = [...set].sort((a, b) => a.localeCompare(b)).map((n) => ({ value: n, label: n }));
    if (hasUnassigned) arr.push({ value: UNASSIGNED, label: t('monitoring:kanban.unassigned') });
    return arr;
  }, [local, t]);

  const statusOptions = statusColumns.map((c) => ({ value: c.id, label: c.label }));

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const col = String(over.id);
    const it = local.find((x) => cardId(x) === active.id);
    if (!it || itemStatusColumn(it) === col) return;

    const newStatus = columnToStatus(it, col);
    const prev = local;
    setLocal((cur) => cur.map((x) => (cardId(x) === active.id ? { ...x, status: newStatus } : x)));
    try {
      await onMove(it, col, newStatus);
    } catch {
      setLocal(prev); // 409 등은 api client 가 토스트
    }
  };

  const activeItem = activeId ? local.find((x) => cardId(x) === activeId) ?? null : null;
  const empty = emptyTitle ?? t('monitoring:kanban.empty');

  if (local.length === 0) {
    return <EmptyState icon={<Star size={32} />} title={empty} />;
  }

  const toolbar = (
    <FilterBar>
      {dims.length > 1 && (
        <SegmentedControl
          items={dims.map((g) => ({ key: g, label: t(GROUP_DIM_LABEL[g]) }))}
          value={groupBy}
          onChange={handleGroupChange}
        />
      )}
      {showKindFilter && (
        <>
          <span className="w-px self-stretch bg-default" aria-hidden />
          <SegmentedControl
            items={KIND_FILTERS.map((f) => ({ key: f.key, label: t(f.labelKey) }))}
            value={kindFilter}
            onChange={setKindFilter}
          />
        </>
      )}
      {dims.includes('status') && groupBy !== 'status' && (
        <FilterSelect label={t('monitoring:kanban.filterStatus')} value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
      )}
      {dims.includes('project') && groupBy !== 'project' && (
        <FilterSelect label={t('monitoring:kanban.filterProject')} value={projectFilter} onChange={setProjectFilter} options={projectOptions} />
      )}
      {dims.includes('assignee') && groupBy !== 'assignee' && (
        <FilterSelect label={t('monitoring:kanban.filterAssignee')} value={assigneeFilter} onChange={setAssigneeFilter} options={assigneeOptions} />
      )}
    </FilterBar>
  );

  if (visible.length === 0) {
    return (
      <div className="space-y-3">
        {toolbar}
        <EmptyState icon={<Star size={32} />} title={empty} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {toolbar}
      {groupBy === 'status' ? (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div
            className="grid gap-3 items-start overflow-x-auto pb-2"
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(220px, 1fr))` }}
          >
            {columns.map((c) => (
              <DroppableColumn key={c.id} column={c} count={byColumn[c.id]?.length ?? 0}>
                {(byColumn[c.id] ?? []).map((it) => (
                  <KanbanCard key={cardId(it)} item={it} theme={theme} showProjectTag={showProjectTag} onOpen={() => onOpen(it)} />
                ))}
              </DroppableColumn>
            ))}
          </div>
          <DragOverlay>
            {activeItem ? <CardBody item={activeItem} theme={theme} showProjectTag={showProjectTag} dragging /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="flex gap-3 overflow-x-auto items-start pb-2">
          {columns.map((c) => (
            <PivotColumn key={c.id} column={c} count={byColumn[c.id]?.length ?? 0}>
              {(byColumn[c.id] ?? []).map((it) => (
                <div
                  key={`${c.id}::${cardId(it)}`}
                  onClick={() => onOpen(it)}
                  className="cursor-pointer"
                >
                  <CardBody item={it} theme={theme} showProjectTag={showProjectTag} />
                </div>
              ))}
            </PivotColumn>
          ))}
        </div>
      )}
    </div>
  );
}

function SegmentedControl<T extends string>({
  items, value, onChange,
}: {
  items: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-default bg-surface p-0.5">
      {items.map((f) => {
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

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const { t } = useTranslation();
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-secondary">
      <span className="text-muted">{label}</span>
      <Select inputSize="sm" fullWidth={false} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="all">{t('monitoring:kanban.filterAll')}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
    </label>
  );
}

function ColumnShell({
  column, count, isOver, children, innerRef,
}: {
  column: ColumnDef;
  count: number;
  isOver?: boolean;
  children: React.ReactNode;
  innerRef?: (el: HTMLElement | null) => void;
}) {
  return (
    <div
      ref={innerRef}
      className={`rounded-md border p-2 min-h-[64px] transition-colors ${
        isOver ? 'border-accent bg-surface-2' : 'border-default bg-surface'
      }`}
    >
      <div className="flex items-center justify-between px-1 mb-2 gap-2">
        <h3 className="text-sm font-semibold text-primary flex items-center gap-1.5 min-w-0">
          {column.bg && (
            <span
              className="shrink-0 text-[10px] px-1.5 py-0.5 rounded"
              style={{ backgroundColor: column.bg, color: column.textColor }}
            >
              {column.glyph}
            </span>
          )}
          <span className="truncate" title={column.label}>{column.label}</span>
          <span className="text-muted font-normal shrink-0">{count}</span>
        </h3>
        {column.note && <span className="text-[10px] text-muted shrink-0">{column.note}</span>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DroppableColumn({ column, count, children }: { column: ColumnDef; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return <ColumnShell column={column} count={count} isOver={isOver} innerRef={setNodeRef}>{children}</ColumnShell>;
}

function PivotColumn({ column, count, children }: { column: ColumnDef; count: number; children: React.ReactNode }) {
  return (
    <div className="w-64 min-w-[16rem] shrink-0">
      <ColumnShell column={column} count={count}>{children}</ColumnShell>
    </div>
  );
}

function KanbanCard({ item, theme, showProjectTag, onOpen }: { item: KanbanItem; theme: ThemeMode; showProjectTag: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: cardId(item) });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
    >
      <CardBody item={item} theme={theme} showProjectTag={showProjectTag} />
    </div>
  );
}

function CardBody({ item, theme, showProjectTag, dragging }: { item: KanbanItem; theme: ThemeMode; showProjectTag: boolean; dragging?: boolean }) {
  const { t } = useTranslation();
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
        {showProjectTag && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded truncate max-w-[10rem]"
            style={{ backgroundColor: pc.bg, color: pc.text }}
            title={item.projectName}
          >
            {pc.glyph} {item.projectName}
          </span>
        )}
        {item.assignee && (
          <span className="text-[10px] text-secondary truncate max-w-[10rem]" title={item.assignee}>
            {item.assignee}
          </span>
        )}
        {pri && <Badge variant={pri.variant} size="sm">{t(pri.labelKey)}</Badge>}
        {item.dueDate && <span className="text-[10px] text-on-warning">{item.dueDate.slice(0, 10)}</span>}
      </div>
    </Card>
  );
}
