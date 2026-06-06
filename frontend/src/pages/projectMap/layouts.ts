import type { ChangeLog, DevInfoItem, Issue, Meeting, WbsItem } from '../../types';

export type LayoutMode = 'radial' | 'hierarchy' | 'timeline';
export type FilterState = { wbs: boolean; changes: boolean; meetings: boolean; dev: boolean; issues: boolean };
export type TimeWindow = { start: string; end: string };
export type Position = { x: number; y: number };
export type DateRange = { min: string; max: string };

export type MapData = {
  wbs: WbsItem[];
  changeLogs: ChangeLog[];
  meetings: Meeting[];
  devInfo: DevInfoItem[];
  issues: Issue[];
};

export function flattenWbs(items: WbsItem[]): WbsItem[] {
  return items.flatMap((it) => [it, ...flattenWbs(it.children ?? [])]);
}

// Date the node represents on the timeline.
// WBS: endDate (delivery point) → fall back to startDate.
// ChangeLog / Meeting: their `date`.
// DevInfo: createdAt (no domain date field exists).
// Issue: dueDate (when it needs to be done) → fall back to createdAt.
export function wbsDate(w: WbsItem): string | null {
  return w.endDate ?? w.startDate ?? null;
}
export function changeDate(c: ChangeLog): string {
  return c.date;
}
export function meetingDate(m: Meeting): string {
  return m.date;
}
export function devDate(d: DevInfoItem): string {
  return d.createdAt;
}
export function issueDate(i: Issue): string | null {
  return i.dueDate ?? i.createdAt ?? null;
}

export function computeDateRange(data: MapData): DateRange | null {
  const all: string[] = [];
  flattenWbs(data.wbs).forEach((w) => { const d = wbsDate(w); if (d) all.push(d.slice(0, 10)); });
  data.changeLogs.forEach((c) => all.push(c.date.slice(0, 10)));
  data.meetings.forEach((m) => all.push(m.date.slice(0, 10)));
  data.devInfo.forEach((d) => all.push(d.createdAt.slice(0, 10)));
  data.issues.forEach((i) => { const d = issueDate(i); if (d) all.push(d.slice(0, 10)); });
  if (all.length === 0) return null;
  all.sort();
  return { min: all[0], max: all[all.length - 1] };
}

// ===== Radial layout =====
//
// 5 카테고리(WBS / 변경 / 이슈 / 회의 / 개발) hub 를 정오각형 정점에 둔다.
// 각 hub 의 자식들은 그 hub 방향(catAngle ± SLICE_HALF) 안에서 부채꼴 분산.
// SLICE_HALF=30° → 슬라이스 폭 60°. 펜타곤 슬라이스가 72° 라 ±36° 까지 가능하지만
// 옆 카테고리와의 시각적 여백을 위해 약간 좁힌다. 자식이 한 줄(MAX_PER_ROW)
// 을 넘으면 더 바깥 반지름의 추가 줄에 같은 각도 분포로 쌓는다.
const HUB_DIST = 280;
const CHILD_RADIUS_BASE = HUB_DIST + 110;
const CHILD_RADIUS_STEP = 90;
const SLICE_HALF_DEG = 30;
const MAX_PER_ROW = 7;

const CATEGORY_ANGLES_DEG: Record<string, number> = {
  // 화면 좌표계는 y 가 아래 양수 → -90° 가 위(↑).
  // 시계 방향으로 72° 씩: WBS(위) → 변경(우상) → 이슈(우하) → 회의(좌하) → 개발(좌상).
  'cat-wbs':      -90,
  'cat-changes':  -18,
  'cat-issues':    54,
  'cat-meetings': 126,
  'cat-dev':      198,
};

function degToRad(deg: number): number { return (deg * Math.PI) / 180; }

export function buildRadialPositions(data: MapData, filter: FilterState): Record<string, Position> {
  const cx = 0, cy = 0;
  const positions: Record<string, Position> = {
    project: { x: cx, y: cy },
  };

  // hub (카테고리) 노드 — 정오각형 정점.
  for (const [id, deg] of Object.entries(CATEGORY_ANGLES_DEG)) {
    const a = degToRad(deg);
    positions[id] = { x: cx + Math.cos(a) * HUB_DIST, y: cy + Math.sin(a) * HUB_DIST };
  }

  const placeChildren = <T extends { id: number }>(
    catKey: keyof typeof CATEGORY_ANGLES_DEG,
    items: T[],
    makeNodeId: (id: number) => string,
  ) => {
    const catAngle = CATEGORY_ANGLES_DEG[catKey];
    const sliceSpan = 2 * SLICE_HALF_DEG;
    items.forEach((item, idx) => {
      const rowIdx = Math.floor(idx / MAX_PER_ROW);
      const colIdx = idx % MAX_PER_ROW;
      const inThisRow = Math.min(items.length - rowIdx * MAX_PER_ROW, MAX_PER_ROW);
      const angleDeg = inThisRow === 1
        ? catAngle
        : catAngle - SLICE_HALF_DEG + (sliceSpan / (inThisRow - 1)) * colIdx;
      const r = CHILD_RADIUS_BASE + rowIdx * CHILD_RADIUS_STEP;
      const a = degToRad(angleDeg);
      positions[makeNodeId(item.id)] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    });
  };

  if (filter.wbs)      placeChildren('cat-wbs',      flattenWbs(data.wbs), (id) => `wbs-${id}`);
  if (filter.changes)  placeChildren('cat-changes',  data.changeLogs,       (id) => `change-${id}`);
  if (filter.meetings) placeChildren('cat-meetings', data.meetings,          (id) => `meeting-${id}`);
  if (filter.dev)      placeChildren('cat-dev',      data.devInfo,           (id) => `dev-${id}`);
  if (filter.issues)   placeChildren('cat-issues',   data.issues,            (id) => `issue-${id}`);

  return positions;
}

// ===== Timeline =====
export const TIMELINE_WIDTH = 1800;
export const LANE_HEIGHT = 130;
export type LaneKey = 'wbs' | 'change' | 'meeting' | 'dev' | 'issue';
export const LANE_Y: Record<LaneKey, number> = {
  wbs: 0,
  change: LANE_HEIGHT,
  meeting: LANE_HEIGHT * 2,
  dev: LANE_HEIGHT * 3,
  issue: LANE_HEIGHT * 4,
};

export const TIMELINE_LANES: { key: LaneKey; label: string; strokeColor: string; bgColor: string }[] = [
  { key: 'wbs',     label: 'WBS',       strokeColor: '#a5b4fc', bgColor: 'rgba(129, 140, 248, 0.05)' },
  { key: 'change',  label: '변경이력',   strokeColor: '#fdba74', bgColor: 'rgba(251, 146, 60, 0.05)' },
  { key: 'meeting', label: '회의록',     strokeColor: '#6ee7b7', bgColor: 'rgba(110, 231, 183, 0.05)' },
  { key: 'dev',     label: '업무 정보',  strokeColor: '#67e8f9', bgColor: 'rgba(103, 232, 249, 0.05)' },
  { key: 'issue',   label: '이슈',       strokeColor: '#fda4af', bgColor: 'rgba(244, 63, 94, 0.05)' },
];

function isoToMs(iso: string): number {
  // Date(iso) works for both 'YYYY-MM-DD' and full ISO timestamps.
  return new Date(iso.slice(0, 10) + 'T00:00:00Z').getTime();
}

export function scaleDateToWorldX(iso: string, window: TimeWindow): number {
  const minMs = isoToMs(window.start);
  const maxMs = isoToMs(window.end);
  const span = Math.max(1, maxMs - minMs);
  return ((isoToMs(iso) - minMs) / span) * TIMELINE_WIDTH;
}

export type Tick = { iso: string; label: string; worldX: number; major: boolean };

function pad2(n: number): string { return String(n).padStart(2, '0'); }

export function generateTimelineTicks(window: TimeWindow): Tick[] {
  const startMs = isoToMs(window.start);
  const endMs = isoToMs(window.end);
  const spanDays = (endMs - startMs) / (24 * 60 * 60 * 1000);
  const ticks: Tick[] = [];

  if (spanDays > 730) {
    // Yearly: Jan 1 of each year in range
    const startYear = new Date(startMs).getUTCFullYear();
    const endYear = new Date(endMs).getUTCFullYear();
    for (let y = startYear; y <= endYear; y++) {
      const iso = `${y}-01-01`;
      const wx = scaleDateToWorldX(iso, window);
      ticks.push({ iso, label: String(y), worldX: wx, major: true });
    }
  } else if (spanDays > 60) {
    // Monthly: 1st of each month
    const startDate = new Date(startMs);
    const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
    while (cursor.getTime() <= endMs) {
      const y = cursor.getUTCFullYear();
      const m = cursor.getUTCMonth() + 1;
      const iso = `${y}-${pad2(m)}-01`;
      const wx = scaleDateToWorldX(iso, window);
      ticks.push({
        iso,
        label: m === 1 ? String(y) : `${m}월`,
        worldX: wx,
        major: m === 1,
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  } else {
    // Weekly: each Monday
    const cursor = new Date(startMs);
    const dow = cursor.getUTCDay(); // 0=Sun,1=Mon,...
    const daysToMon = (1 - dow + 7) % 7;
    cursor.setUTCDate(cursor.getUTCDate() + daysToMon);
    while (cursor.getTime() <= endMs) {
      const m = cursor.getUTCMonth() + 1;
      const d = cursor.getUTCDate();
      const iso = cursor.toISOString().slice(0, 10);
      const wx = scaleDateToWorldX(iso, window);
      ticks.push({
        iso,
        label: `${m}/${d}`,
        worldX: wx,
        major: d <= 7,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }
  return ticks;
}

// Bumps nodes that share the same x so they don't overlap visually.
function jitterY(baseY: number, idx: number): number {
  // Alternating +/- offset, growing slowly with index.
  const step = 24;
  const sign = idx % 2 === 0 ? 1 : -1;
  const mag = Math.floor((idx + 1) / 2) * step;
  return baseY + sign * mag;
}

export function buildTimelinePositions(
  data: MapData,
  filter: FilterState,
  window: TimeWindow,
): Record<string, Position> {
  const positions: Record<string, Position> = {};

  // Group by x within each lane to apply jitter for overlapping nodes.
  type Bucket = Map<number, number>; // rounded-x → count
  const buckets: Record<LaneKey, Bucket> = {
    wbs: new Map(), change: new Map(), meeting: new Map(), dev: new Map(), issue: new Map(),
  };
  const placeOnLane = (lane: LaneKey, iso: string, id: string) => {
    const x = scaleDateToWorldX(iso, window);
    const xKey = Math.round(x / 30) * 30;
    const idx = buckets[lane].get(xKey) ?? 0;
    buckets[lane].set(xKey, idx + 1);
    positions[id] = { x, y: jitterY(LANE_Y[lane], idx) };
  };

  if (filter.wbs) {
    flattenWbs(data.wbs).forEach((w) => {
      const d = wbsDate(w);
      if (d) placeOnLane('wbs', d, `wbs-${w.id}`);
    });
  }
  if (filter.changes) {
    data.changeLogs.forEach((c) => placeOnLane('change', c.date, `change-${c.id}`));
  }
  if (filter.meetings) {
    data.meetings.forEach((m) => placeOnLane('meeting', m.date, `meeting-${m.id}`));
  }
  if (filter.dev) {
    data.devInfo.forEach((d) => placeOnLane('dev', d.createdAt, `dev-${d.id}`));
  }
  if (filter.issues) {
    data.issues.forEach((i) => {
      const d = issueDate(i);
      if (d) placeOnLane('issue', d, `issue-${i.id}`);
    });
  }
  return positions;
}

// Cytoscape layout option per mode.
export function getLayoutForMode(mode: LayoutMode): Record<string, unknown> {
  if (mode === 'hierarchy') {
    return {
      name: 'dagre',
      rankDir: 'TB',
      nodeSep: 40,
      rankSep: 90,
      edgeSep: 10,
      animate: false,
      padding: 30,
    };
  }
  return { name: 'preset' };
}

// In timeline mode, hubs/project are skipped (no meaningful date).
export function shouldIncludeHubs(mode: LayoutMode): boolean {
  return mode !== 'timeline';
}

// In timeline mode, items without a date are skipped.
export function isInTimeline(date: string | null | undefined, window: TimeWindow): boolean {
  if (!date) return false;
  const iso = date.slice(0, 10);
  return iso >= window.start && iso <= window.end;
}
