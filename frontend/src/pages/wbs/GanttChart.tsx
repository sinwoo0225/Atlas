/* eslint-disable @typescript-eslint/no-explicit-any */
// ECharts 콜백 API(custom series renderItem, mousedown params, tooltip formatter 등) 는
// echarts-for-react 의 EChartsInstance 자체가 any 이고 ECharts 공식 콜백 시그니처가
// 동적이라 좁힌 타입을 부여해도 캐스팅이 누적된다. 다른 페이지(WbsPage·Dashboard 등)
// 와 일관성을 위해 파일 단위로 any 룰을 끈다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsInstance } from 'echarts-for-react';
import * as htmlToImage from 'html-to-image';
import { ChevronDown, ChevronRight, Diamond, Download, Filter, X } from 'lucide-react';
import type { WbsItem, WbsStatus } from '../../types';
import { wbsApi } from '../../api/wbs';
import { useThemeMode, getChartColors, type ChartColors } from '../../utils/themeColors';
import { wbsStatusBadge } from '../../utils/statusMaps';
import { Button } from '../../components/ui';

/* ============================================================================
 * 데이터 평탄화 — 트리 보존 + 형제 내 정렬 + 접힘 처리 + 부모 막대 자동 계산
 * ==========================================================================*/

interface GanttRow {
  item: WbsItem;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  /** 화면에 그릴 막대의 시작/끝 시각 (ms). 없으면 막대 미표시(행만 노출). */
  effStart?: number;
  effEnd?: number;
  /** 부모이면서 자식 합산 범위로 그리는 막대인지(=얇은 음영 표시). */
  isParentBar: boolean;
}

function siblingSort(a: WbsItem, b: WbsItem): number {
  // order 내림차순(높음=3 먼저) → startDate 오름차순(없으면 뒤로)
  if (a.order !== b.order) return b.order - a.order;
  const ta = a.startDate ? new Date(a.startDate).getTime() : Number.POSITIVE_INFINITY;
  const tb = b.startDate ? new Date(b.startDate).getTime() : Number.POSITIVE_INFINITY;
  return ta - tb;
}

/** 노드와 모든 후손 중 startDate/endDate 가 있는 것들의 min/max. */
function spanOf(item: WbsItem): { start?: number; end?: number } {
  let start: number | undefined;
  let end: number | undefined;
  const visit = (n: WbsItem) => {
    if (n.startDate) {
      const t = new Date(n.startDate).getTime();
      if (start === undefined || t < start) start = t;
    }
    if (n.endDate) {
      const t = new Date(n.endDate).getTime();
      if (end === undefined || t > end) end = t;
    }
    n.children?.forEach(visit);
  };
  visit(item);
  return { start, end };
}

function flattenForGantt(items: WbsItem[], collapsed: Set<number>): GanttRow[] {
  const out: GanttRow[] = [];
  const walk = (nodes: WbsItem[], depth: number) => {
    const sorted = [...nodes].sort(siblingSort);
    for (const item of sorted) {
      const hasChildren = (item.children?.length ?? 0) > 0;
      const isCollapsed = hasChildren && collapsed.has(item.id);
      let effStart: number | undefined;
      let effEnd: number | undefined;
      let isParentBar = false;
      if (hasChildren) {
        // 부모: 본인 값 우선, 없으면 후손 합산 범위로
        const span = spanOf(item);
        effStart = item.startDate ? new Date(item.startDate).getTime() : span.start;
        effEnd = item.endDate ? new Date(item.endDate).getTime() : span.end;
        isParentBar = true;
      } else {
        effStart = item.startDate ? new Date(item.startDate).getTime() : undefined;
        effEnd = item.endDate ? new Date(item.endDate).getTime() : undefined;
      }
      out.push({ item, depth, hasChildren, isCollapsed, effStart, effEnd, isParentBar });
      if (hasChildren && !isCollapsed) walk(item.children!, depth + 1);
    }
  };
  walk(items, 0);
  return out;
}

/* ============================================================================
 * 보조 함수
 * ==========================================================================*/

const DAY_MS = 86_400_000;
const HANDLE_HIT_PX = 6;       // 리사이즈 핸들 hit-test 너비
const BAR_VERT_TOLERANCE = 9;  // 막대 중심에서 ±이만큼 안에 마우스가 있으면 막대 위로 간주

function snapToDay(t: number): number {
  // 로컬 시간대 자정 기준으로 스냅. UTC 자정으로 round 하면 KST(UTC+9) 에서
  // 시각이 0~9시 사이일 때 전날 자정으로 잘못 스냅되는 문제 회피.
  const d = new Date(t);
  const noon = new Date(d);
  noon.setHours(0, 0, 0, 0);
  const midnight = noon.getTime();
  const nextMidnight = midnight + DAY_MS;
  return (t - midnight) < (nextMidnight - t) ? midnight : nextMidnight;
}

function toIsoDate(t: number): string {
  // toISOString() 은 UTC 변환이라 KST(UTC+9) 로컬 자정이 전날로 떨어진다.
  // 사용자 입력 날짜(`<input type="date">` 의 YYYY-MM-DD)는 로컬 자정 기준이므로
  // 로컬 시간으로 직접 포매팅해야 백엔드 데이터와 1:1 매칭된다.
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function uniqueAssignees(items: WbsItem[]): string[] {
  const set = new Set<string>();
  const walk = (n: WbsItem) => {
    if (n.assignee?.trim()) set.add(n.assignee.trim());
    n.children?.forEach(walk);
  };
  items.forEach(walk);
  return [...set].sort();
}

function weekendMarkAreas(minT: number, maxT: number): Array<Array<{ xAxis: number }>> {
  const areas: Array<Array<{ xAxis: number }>> = [];
  const start = new Date(minT);
  start.setHours(0, 0, 0, 0);
  let d = start.getTime();
  const cap = Math.min(maxT + DAY_MS, minT + DAY_MS * 730);
  while (d < cap) {
    const wd = new Date(d).getDay();
    if (wd === 0 || wd === 6) {
      areas.push([{ xAxis: d }, { xAxis: d + DAY_MS }]);
    }
    d += DAY_MS;
  }
  return areas;
}

function statusColor(status: WbsStatus, colors: ChartColors): string {
  if (status === 'Done') return colors.ganttBarDone;
  if (status === 'InProgress') return colors.ganttBarInProgress;
  return colors.ganttBarPlanned;
}

/* ============================================================================
 * 좌측 HTML 라벨 영역 — ECharts Y축 대체. 행 높이/패딩을 ECharts grid 와 동기화.
 * ==========================================================================*/

const ROW_HEIGHT = 32;
const TOP_PAD = 28;     // ECharts grid.top 과 동일
const BOTTOM_PAD = 70;  // grid.bottom (dataZoom slider 공간 포함)
const LABEL_WIDTH = 280;

function LabelColumn({
  rows,
  hoveredId,
  filterDim,
  colors,
  onToggle,
  onItemDoubleClick,
  onItemHover,
}: {
  rows: GanttRow[];
  hoveredId: number | null;
  filterDim: (item: WbsItem) => boolean;
  colors: ChartColors;
  onToggle: (id: number) => void;
  onItemDoubleClick: (item: WbsItem) => void;
  onItemHover: (id: number | null) => void;
}) {
  return (
    <div
      className="border-r border-default flex-shrink-0"
      style={{ width: LABEL_WIDTH, paddingTop: TOP_PAD, paddingBottom: BOTTOM_PAD }}
    >
      {rows.map((row) => {
        const dim = filterDim(row.item);
        const isHovered = hoveredId === row.item.id;
        return (
          <div
            key={row.item.id}
            onDoubleClick={() => onItemDoubleClick(row.item)}
            onMouseEnter={() => onItemHover(row.item.id)}
            onMouseLeave={() => onItemHover(null)}
            className="flex items-center text-sm cursor-default select-none transition-colors"
            style={{
              height: ROW_HEIGHT,
              paddingLeft: 8 + row.depth * 16,
              paddingRight: 8,
              opacity: dim ? 0.35 : 1,
              backgroundColor: isHovered ? colors.ganttRowHover : 'transparent',
            }}
          >
            {row.hasChildren ? (
              <button
                onClick={(e) => { e.stopPropagation(); onToggle(row.item.id); }}
                className="text-muted hover:text-primary transition-colors mr-1 flex-shrink-0"
                title={row.isCollapsed ? '펼치기' : '접기'}
              >
                {row.isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
            ) : (
              <span className="w-[18px] flex-shrink-0" />
            )}
            {row.item.isMilestone && (
              <Diamond size={11} className="text-accent-2 flex-shrink-0 mr-1" />
            )}
            <span
              className={`truncate ${row.hasChildren ? 'text-primary font-medium' : 'text-secondary'}`}
              title={row.item.name}
            >
              {row.item.name}
            </span>
            {row.item.assignee && (
              <span className="ml-auto text-[11px] text-muted truncate max-w-[80px]" title={row.item.assignee}>
                {row.item.assignee}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================================
 * 메인 GanttChart 컴포넌트
 * ==========================================================================*/

type Scale = 'day' | 'week' | 'month';
type DragMode = 'move' | 'resize-l' | 'resize-r';
interface DragState {
  itemId: number;
  mode: DragMode;
  startClientX: number;
  origStart: number;
  origEnd: number;
  curStart: number;
  curEnd: number;
  /** mousedown 시점에 1회 계산된 픽셀당 ms. 드래그 중 차트가 재구성돼도 변환 비율은 고정. */
  msPerPx: number;
  /** 미리보기 그릴 행의 y 픽셀 중심. */
  yPixel: number;
}

export function GanttChart({
  items,
  projectId,
  onDoubleClick,
  onItemsChanged,
}: {
  items: WbsItem[];
  projectId: number;
  onDoubleClick: (item: WbsItem) => void;
  /** 드래그로 일정이 바뀐 뒤 부모에서 다시 fetch 하도록 알리는 콜백. */
  onItemsChanged: () => void;
}) {
  const theme = useThemeMode();
  const colors = getChartColors(theme);
  const chartRef = useRef<EChartsInstance>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const chartAreaRef = useRef<HTMLDivElement | null>(null);
  const lastCursorRef = useRef<string>('default');
  // 현재 차트 영역에서 hover 중인 row 인덱스 — 핸들 graphic 중복 갱신 방지.
  const lastHoverRowRef = useRef<number | null>(null);

  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [scale, setScale] = useState<Scale>('day');
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [filterStatuses, setFilterStatuses] = useState<Set<WbsStatus>>(new Set());
  const [filterAssignees, setFilterAssignees] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  // 사용자가 줌·팬으로 설정한 dataZoom 백분율. notMerge=true 라도 옵션에 매번 명시해 유지.
  const [zoomRange, setZoomRange] = useState<{ start: number; end: number }>({ start: 0, end: 100 });

  // 드래그 상태는 React state 가 아닌 ref. 매 mousemove 마다 React re-render 를 피해야
  // ECharts 차트 전체가 재구성되지 않고 dataZoom·좌표계가 안정적으로 유지된다.
  const dragRef = useRef<DragState | null>(null);

  // 최신 rows·props 를 핸들러에서 참조하기 위해 ref 로 보관 (useEffect deps 를 비우기 위함).
  // ref 의 .current 업데이트는 render 가 아닌 commit 단계(useEffect) 에서 한다 (react-hooks/purity).
  const rowsRef = useRef<GanttRow[]>([]);
  const projectIdRef = useRef(projectId);
  const onItemsChangedRef = useRef(onItemsChanged);

  const rows = useMemo(() => flattenForGantt(items, collapsed), [items, collapsed]);
  const visibleRows = rows;

  useEffect(() => { rowsRef.current = rows; }, [rows]);
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);
  useEffect(() => { onItemsChangedRef.current = onItemsChanged; }, [onItemsChanged]);

  const allAssignees = useMemo(() => uniqueAssignees(items), [items]);

  const filterDim = (item: WbsItem): boolean => {
    if (filterStatuses.size > 0 && !filterStatuses.has(item.status)) return true;
    if (filterAssignees.size > 0 && !filterAssignees.has(item.assignee?.trim() ?? '')) return true;
    return false;
  };

  const [nowMs] = useState(() => Date.now());
  const allTimes = rows.flatMap((r) => [r.effStart, r.effEnd].filter((t): t is number => t !== undefined));
  const minT = allTimes.length ? Math.min(...allTimes) - DAY_MS * 3 : nowMs - DAY_MS * 30;
  const maxT = allTimes.length ? Math.max(...allTimes) + DAY_MS * 7 : nowMs + DAY_MS * 30;

  const toggle = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleStatus = (s: WbsStatus) => {
    setFilterStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const toggleAssignee = (a: string) => {
    setFilterAssignees((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  };

  const clearFilters = () => {
    setFilterStatuses(new Set());
    setFilterAssignees(new Set());
  };

  /* ─────────── graphic 패치 (React state 우회) ───────────
     hover 핸들과 드래그 미리보기는 둘 다 ECharts graphic 컴포넌트로 직접 그린다.
     서로 동시에 그리지는 않는다 — 드래그 중에는 hover 핸들이 안 보이고,
     hover 중에는 드래그가 진행 안 됨. setOption({graphic:[...]}, {replaceMerge:'graphic'})
     로 매번 통째 교체. */

  const applyDragPreview = useCallback((drag: DragState) => {
    const chart = chartRef.current;
    if (!chart) return;
    const x0 = chart.convertToPixel({ gridIndex: 0 }, [drag.curStart, 0])?.[0];
    const x1 = chart.convertToPixel({ gridIndex: 0 }, [drag.curEnd, 0])?.[0];
    if (x0 == null || x1 == null) return;
    chart.setOption(
      {
        graphic: [
          {
            id: 'drag-preview',
            type: 'rect',
            z: 100,
            shape: { x: x0, y: drag.yPixel - 9, width: Math.max(x1 - x0, 2), height: 18, r: 3 },
            style: {
              fill: 'transparent',
              stroke: colors.accent,
              lineWidth: 2,
              lineDash: [4, 3],
            },
            silent: true,
          },
        ],
      },
      { replaceMerge: 'graphic' },
    );
  }, [colors.accent]);

  const clearGraphic = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption({ graphic: [] }, { replaceMerge: 'graphic' });
  }, []);

  const showHandles = useCallback((yIdx: number, row: GanttRow) => {
    const chart = chartRef.current;
    if (!chart || dragRef.current) return; // 드래그 중에는 미리보기가 우선
    if (row.effStart == null || row.effEnd == null) return;
    const x0 = chart.convertToPixel({ gridIndex: 0 }, [row.effStart, 0])?.[0];
    const x1 = chart.convertToPixel({ gridIndex: 0 }, [row.effEnd, 0])?.[0];
    const yC = chart.convertToPixel({ gridIndex: 0 }, [0, yIdx])?.[1];
    if (x0 == null || x1 == null || yC == null) return;
    const handleW = 4;
    const handleH = 20;
    const stroke = theme === 'light' ? '#ffffff' : '#0a0a0c';
    chart.setOption(
      {
        graphic: [
          {
            id: 'handle-l',
            type: 'rect',
            z: 50,
            shape: { x: x0 - handleW / 2, y: yC - handleH / 2, width: handleW, height: handleH, r: 2 },
            style: { fill: colors.accent, stroke, lineWidth: 1 },
            cursor: 'ew-resize',
            silent: true,
          },
          {
            id: 'handle-r',
            type: 'rect',
            z: 50,
            shape: { x: x1 - handleW / 2, y: yC - handleH / 2, width: handleW, height: handleH, r: 2 },
            style: { fill: colors.accent, stroke, lineWidth: 1 },
            cursor: 'ew-resize',
            silent: true,
          },
        ],
      },
      { replaceMerge: 'graphic' },
    );
  }, [colors.accent, theme]);

  const hideHandles = useCallback(() => {
    if (dragRef.current) return; // 드래그 중에는 graphic = 미리보기. 손대지 않음.
    clearGraphic();
  }, [clearGraphic]);

  /* ─────────── window mousemove/mouseup 리스너 (mount 시 1회만 등록) ─────────── */

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startClientX;
      const dt = dx * drag.msPerPx;
      let nextStart = drag.origStart;
      let nextEnd = drag.origEnd;
      if (drag.mode === 'move') {
        nextStart = snapToDay(drag.origStart + dt);
        nextEnd = nextStart + (drag.origEnd - drag.origStart);
      } else if (drag.mode === 'resize-l') {
        nextStart = snapToDay(drag.origStart + dt);
        if (nextStart > drag.origEnd - DAY_MS) nextStart = drag.origEnd - DAY_MS;
      } else if (drag.mode === 'resize-r') {
        nextEnd = snapToDay(drag.origEnd + dt);
        if (nextEnd < drag.origStart + DAY_MS) nextEnd = drag.origStart + DAY_MS;
      }
      drag.curStart = nextStart;
      drag.curEnd = nextEnd;
      applyDragPreview(drag);
    };
    const handleUp = async () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      document.body.style.cursor = '';
      clearGraphic();
      // 드래그 종료 직후 사용자가 같은 위치에 머물면 onMouseMove 가 다시 호출되어
      // 핸들을 다시 그려야 한다. lastHoverRowRef 가 stale 이면 갱신이 스킵되므로 reset.
      lastHoverRowRef.current = null;
      if (drag.curStart === drag.origStart && drag.curEnd === drag.origEnd) return;
      const item = rowsRef.current.find((r) => r.item.id === drag.itemId)?.item;
      if (!item) return;
      try {
        await wbsApi.update(projectIdRef.current, item.id, {
          ...item,
          startDate: toIsoDate(drag.curStart),
          endDate: toIsoDate(drag.curEnd),
        });
        onItemsChangedRef.current();
      } catch (err) {
        console.error('drag update failed', err);
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [applyDragPreview, clearGraphic]);

  /* ─────────── ECharts 이벤트 핸들러 (mousedown/hover/datazoom) ─────────── */

  const onChartReady = (chart: EChartsInstance) => {
    chartRef.current = chart;
    chart.on('mousedown', (params: any) => {
      // 드래그 중에 동일 막대 위에 포인터가 머물면 ECharts 가 mousedown 을 다시
      // 트리거할 수 있다 — 새 드래그 컨텍스트가 잡혀 좌표가 어긋남. 가드.
      if (dragRef.current) return;
      if (params.componentType !== 'series') return;
      const data = params.data;
      if (!data || data.kind === 'milestone' || data.kind === 'parent') return;
      const itemId = data.itemId as number;
      const row = rowsRef.current.find((r) => r.item.id === itemId);
      if (!row || row.effStart == null || row.effEnd == null) return;
      const ev = params.event?.event as MouseEvent | undefined;
      if (!ev) return;
      const x0 = chart.convertToPixel({ gridIndex: 0 }, [row.effStart, 0])?.[0];
      const x1 = chart.convertToPixel({ gridIndex: 0 }, [row.effEnd, 0])?.[0];
      if (x0 == null || x1 == null) return;
      const yIdx = rowsRef.current.indexOf(row);
      const yPx = chart.convertToPixel({ gridIndex: 0 }, [0, yIdx])?.[1];
      if (yPx == null) return;
      const rect = (chart.getDom() as HTMLElement).getBoundingClientRect();
      const localX = ev.clientX - rect.left;
      let mode: DragMode = 'move';
      if (Math.abs(localX - x0) <= HANDLE_HIT_PX) mode = 'resize-l';
      else if (Math.abs(localX - x1) <= HANDLE_HIT_PX) mode = 'resize-r';
      // 픽셀당 ms — mousedown 시점에 1회 계산해 고정. 드래그 중 차트가 재구성돼도 변환 안정.
      const t0 = chart.convertFromPixel({ gridIndex: 0 }, [0, 0])?.[0];
      const t1 = chart.convertFromPixel({ gridIndex: 0 }, [100, 0])?.[0];
      if (t0 == null || t1 == null) return;
      const msPerPx = (t1 - t0) / 100;
      dragRef.current = {
        itemId,
        mode,
        startClientX: ev.clientX,
        origStart: row.effStart,
        origEnd: row.effEnd,
        curStart: row.effStart,
        curEnd: row.effEnd,
        msPerPx,
        yPixel: yPx,
      };
      document.body.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize';
      applyDragPreview(dragRef.current);
      ev.preventDefault();
    });
    chart.on('mouseover', (params: any) => {
      if (dragRef.current) return;
      if (params.componentType !== 'series') return;
      const id = params.data?.itemId;
      if (typeof id === 'number') setHoveredId(id);
    });
    chart.on('mouseout', () => {
      if (dragRef.current) return;
      setHoveredId(null);
    });
    // 사용자 줌/팬 상태를 state 로 보존 — 매 옵션 patch 마다 그대로 복원되도록.
    chart.on('datazoom', () => {
      const opt = chart.getOption();
      const dzList = (opt.dataZoom as any[]) ?? [];
      const dz = dzList.find((d) => d.type === 'inside') ?? dzList[0];
      if (!dz) return;
      const s = typeof dz.start === 'number' ? dz.start : 0;
      const e = typeof dz.end === 'number' ? dz.end : 100;
      setZoomRange((prev) => (prev.start === s && prev.end === e ? prev : { start: s, end: e }));
    });
  };

  /* ─────────── 차트 영역 hover 시 동적 cursor ─────────── */

  const applyCursor = (c: string) => {
    if (lastCursorRef.current === c) return;
    lastCursorRef.current = c;
    if (chartAreaRef.current) chartAreaRef.current.style.cursor = c;
  };

  const clearHoverHandles = () => {
    if (lastHoverRowRef.current === null) return;
    lastHoverRowRef.current = null;
    hideHandles();
  };

  const handleChartAreaMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current) return; // 드래그 중에는 미리보기가 graphic 점유. 만지지 않음.
    const chart = chartRef.current;
    if (!chart) { applyCursor('default'); clearHoverHandles(); return; }
    const dom = chart.getDom() as HTMLElement;
    const rect = dom.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const coord = chart.convertFromPixel({ gridIndex: 0 }, [px, py]);
    if (!coord) { applyCursor('default'); clearHoverHandles(); return; }
    const yIdx = Math.round(coord[1]);
    const list = rowsRef.current;
    if (yIdx < 0 || yIdx >= list.length) { applyCursor('default'); clearHoverHandles(); return; }
    const row = list[yIdx];
    if (row.isParentBar || row.item.isMilestone || row.effStart == null || row.effEnd == null) {
      applyCursor('default');
      clearHoverHandles();
      return;
    }
    const yC = chart.convertToPixel({ gridIndex: 0 }, [0, yIdx])?.[1];
    if (yC == null || Math.abs(py - yC) > BAR_VERT_TOLERANCE) {
      applyCursor('default');
      clearHoverHandles();
      return;
    }
    const x0 = chart.convertToPixel({ gridIndex: 0 }, [row.effStart, 0])?.[0];
    const x1 = chart.convertToPixel({ gridIndex: 0 }, [row.effEnd, 0])?.[0];
    if (x0 == null || x1 == null) { applyCursor('default'); clearHoverHandles(); return; }
    if (px < x0 - 1 || px > x1 + 1) { applyCursor('default'); clearHoverHandles(); return; }

    // 막대 위 — cursor 와 핸들 갱신
    if (Math.abs(px - x0) <= HANDLE_HIT_PX || Math.abs(px - x1) <= HANDLE_HIT_PX) {
      applyCursor('ew-resize');
    } else {
      applyCursor('grab');
    }
    if (lastHoverRowRef.current !== yIdx) {
      lastHoverRowRef.current = yIdx;
      showHandles(yIdx, row);
    }
  };

  const handleChartAreaMouseLeave = () => {
    if (dragRef.current) return;
    applyCursor('default');
    clearHoverHandles();
  };

  /* ─────────── PNG 저장 (wrapper div 통째로 캡처) ─────────── */

  const handleExportPng = async () => {
    if (!wrapperRef.current) return;
    // 호버 강조는 깔끔한 스크린샷을 위해 잠깐 끔
    setHoveredId(null);
    // hoveredId 변경이 적용되도록 한 프레임 대기
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      const dataUrl = await htmlToImage.toPng(wrapperRef.current, {
        backgroundColor: theme === 'light' ? '#ffffff' : '#12151b',   // --bg-base v2
        pixelRatio: 2,
        cacheBust: true,
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `gantt-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error('PNG export failed', err);
    }
  };

  /* ─────────── ECharts 옵션 빌드 ─────────── */

  // hover 시 좌·우 리사이즈 핸들은 ECharts graphic API 로 직접 그린다 (showHandles).
  // 시리즈 데이터는 hover 플래그 없이 정적 — 호버 시마다 차트 재구성을 피한다.
  const seriesData = rows
    .map((row, idx) => {
      if (row.effStart == null || row.effEnd == null) return null;
      const dim = filterDim(row.item);
      let kind: 'bar' | 'parent' | 'milestone' = 'bar';
      let color = statusColor(row.item.status, colors);
      if (row.item.isMilestone) {
        kind = 'milestone';
        color = colors.ganttMilestone;
      } else if (row.isParentBar) {
        kind = 'parent';
        color = colors.ganttBarParent;
      }
      return {
        name: row.item.name,
        itemId: row.item.id,
        kind,
        value: [idx, row.effStart, row.effEnd, color, kind, dim ? 1 : 0],
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  const axisLabelFormatter = (val: number): string => {
    const d = new Date(val);
    if (scale === 'month') return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  const minInterval = scale === 'month' ? DAY_MS * 30 : scale === 'week' ? DAY_MS * 7 : DAY_MS;

  const totalHeight = Math.max(220, rows.length * ROW_HEIGHT + TOP_PAD + BOTTOM_PAD);

  const option = {
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      trigger: 'item',
      backgroundColor: colors.tooltipBg,
      borderColor: colors.tooltipBorder,
      textStyle: { color: colors.tooltipText },
      formatter: (p: any) => {
        const v = p.data?.value;
        if (!v) return p.name;
        const item = rows[v[0]]?.item;
        const start = toIsoDate(v[1]);
        const end = toIsoDate(v[2]);
        const status = item ? wbsStatusBadge[item.status].label : '';
        const assignee = item?.assignee ? ` · ${item.assignee}` : '';
        return `<div style="font-weight:600">${p.name}</div>` +
               `<div style="font-size:11px;opacity:.85">${start} ~ ${end}</div>` +
               `<div style="font-size:11px;opacity:.7">${status}${assignee}</div>`;
      },
    },
    grid: { left: 4, right: 16, top: TOP_PAD, bottom: BOTTOM_PAD, containLabel: false },
    xAxis: {
      type: 'time',
      min: minT,
      max: maxT,
      position: 'top',
      axisLabel: { color: colors.axisText, fontSize: 11, formatter: axisLabelFormatter, hideOverlap: true },
      axisLine: { lineStyle: { color: colors.axisLine } },
      axisTick: { show: true, lineStyle: { color: colors.axisLine } },
      splitLine: { show: true, lineStyle: { color: colors.splitLine, type: 'dashed' } },
      minInterval,
    },
    yAxis: {
      type: 'category',
      data: rows.map((r) => r.item.name),
      inverse: true,
      show: false,
      axisLabel: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'ctrl', start: zoomRange.start, end: zoomRange.end },
      {
        type: 'slider',
        xAxisIndex: 0,
        height: 18,
        bottom: 18,
        filterMode: 'none',
        start: zoomRange.start,
        end: zoomRange.end,
        textStyle: { color: colors.axisText, fontSize: 10 },
        borderColor: colors.axisLine,
        fillerColor: theme === 'light' ? 'rgba(74,103,151,0.10)' : 'rgba(158,178,206,0.12)',   // 라이트 accent v2 rgba
        handleStyle: { color: colors.accent },
      },
    ],
    series: [
      {
        type: 'custom',
        encode: { x: [1, 2], y: 0, tooltip: [1, 2] },
        renderItem: (_: any, api: any) => {
          const y = api.coord([0, api.value(0)])[1];
          const x0 = api.coord([api.value(1), 0])[0];
          const x1 = api.coord([api.value(2), 0])[0];
          const color = api.value(3);
          const kind = api.value(4);
          const dimFlag = api.value(5);
          const baseOpacity = dimFlag ? 0.25 : 1;

          if (kind === 'milestone') {
            const cx = x1;
            const size = 8;
            return {
              type: 'polygon',
              shape: {
                points: [
                  [cx, y - size],
                  [cx + size, y],
                  [cx, y + size],
                  [cx - size, y],
                ],
              },
              style: { fill: color, opacity: baseOpacity },
              z: 5,
            };
          }
          if (kind === 'parent') {
            const h = 5;
            return {
              type: 'rect',
              shape: { x: x0, y: y - h / 2, width: Math.max(x1 - x0, 2), height: h, r: 2 },
              style: { fill: color, opacity: baseOpacity },
              z: 1,
            };
          }
          // 일반 막대 — 호버 핸들은 graphic API 가 별도로 그린다 (showHandles).
          const h = 16;
          return {
            type: 'rect',
            shape: { x: x0, y: y - h / 2, width: Math.max(x1 - x0, 2), height: h, r: 3 },
            style: { fill: color, opacity: baseOpacity * 0.95 },
            z: 4,
          };
        },
        dimensions: ['y', 'start', 'end', 'color', 'kind', 'dim'],
        data: seriesData,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: colors.ganttToday, type: 'dashed', width: 1.5 },
          label: { color: colors.ganttToday, formatter: '오늘', fontSize: 10, position: 'insideEndTop' },
          data: [{ xAxis: nowMs }],
        },
        markArea: {
          silent: true,
          itemStyle: { color: colors.ganttWeekend },
          data: weekendMarkAreas(minT, maxT),
        },
      },
    ],
  };

  /* ─────────── 렌더 ─────────── */

  return (
    <div className="space-y-2">
      {/* 툴바 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-surface border border-default rounded-md p-0.5 gap-0.5">
          {(['day', 'week', 'month'] as Scale[]).map((s) => (
            <Button
              key={s}
              variant={scale === s ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setScale(s)}
            >
              {s === 'day' ? '일' : s === 'week' ? '주' : '월'}
            </Button>
          ))}
        </div>
        <Button
          variant={showFilters ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setShowFilters((v) => !v)}
          leadingIcon={<Filter size={14} />}
        >
          필터{filterStatuses.size + filterAssignees.size > 0 ? ` (${filterStatuses.size + filterAssignees.size})` : ''}
        </Button>
        {(filterStatuses.size > 0 || filterAssignees.size > 0) && (
          <Button variant="ghost" size="sm" onClick={clearFilters} leadingIcon={<X size={14} />}>
            필터 초기화
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={handleExportPng} leadingIcon={<Download size={14} />}>
          PNG 저장
        </Button>
        <span className="ml-auto text-xs text-muted">
          막대 호버=핸들 표시 · 가운데=이동 / 좌우 끝=리사이즈 · 더블클릭=날짜 모달
        </span>
      </div>

      {showFilters && (
        <div className="bg-surface-2 border border-default rounded-md p-3 space-y-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted w-12">상태</span>
            {(['Planned', 'InProgress', 'Done'] as WbsStatus[]).map((s) => {
              const active = filterStatuses.has(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className={`px-2 py-0.5 rounded border transition-colors ${
                    active ? 'bg-accent-soft border-accent text-accent' : 'border-default text-secondary hover:border-strong'
                  }`}
                >
                  {wbsStatusBadge[s].label}
                </button>
              );
            })}
          </div>
          {allAssignees.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-muted w-12">담당자</span>
              {allAssignees.map((a) => {
                const active = filterAssignees.has(a);
                return (
                  <button
                    key={a}
                    onClick={() => toggleAssignee(a)}
                    className={`px-2 py-0.5 rounded border transition-colors ${
                      active ? 'bg-accent-soft border-accent text-accent' : 'border-default text-secondary hover:border-strong'
                    }`}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 본문: 좌측 라벨 + 우측 차트. PNG 캡처는 이 wrapper 통째. */}
      {rows.length === 0 ? (
        <p className="text-muted text-sm py-4">간트 차트 표시 가능한 작업이 없습니다.</p>
      ) : (
        <div
          ref={wrapperRef}
          className="flex border border-default rounded-md overflow-hidden bg-surface"
          style={{ minHeight: totalHeight }}
        >
          <LabelColumn
            rows={visibleRows}
            hoveredId={hoveredId}
            filterDim={filterDim}
            colors={colors}
            onToggle={toggle}
            onItemDoubleClick={onDoubleClick}
            onItemHover={setHoveredId}
          />
          <div
            ref={chartAreaRef}
            className="flex-1 min-w-0"
            onMouseMove={handleChartAreaMouseMove}
            onMouseLeave={handleChartAreaMouseLeave}
          >
            <ReactECharts
              option={option}
              style={{ height: totalHeight }}
              lazyUpdate={false}
              onChartReady={onChartReady}
            />
          </div>
        </div>
      )}
    </div>
  );
}
