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

// ===== Radial (current layout) =====
const HUB_DIST = 280;
const NODE_SPACING = 80;
const COL_OFFSET = 170;
// Issue 카테고리는 5번째 → 4 cardinal 외 NE 대각선에 배치 (기존 십자 그리드는 보존).
const DIAG = HUB_DIST * Math.SQRT1_2;

function gridCols(n: number): number {
  return Math.max(3, Math.ceil(Math.sqrt(n)));
}

export function buildRadialPositions(data: MapData, filter: FilterState): Record<string, Position> {
  const cx = 0, cy = 0;
  const positions: Record<string, Position> = {
    project: { x: cx, y: cy },
    'cat-wbs': { x: cx, y: cy - HUB_DIST },
    'cat-changes': { x: cx + HUB_DIST, y: cy },
    'cat-meetings': { x: cx, y: cy + HUB_DIST },
    'cat-dev': { x: cx - HUB_DIST, y: cy },
    'cat-issues': { x: cx + DIAG, y: cy - DIAG },
  };

  if (filter.wbs) {
    const items = flattenWbs(data.wbs);
    const cols = gridCols(items.length);
    items.forEach((item, idx) => {
      const col = idx % cols, row = Math.floor(idx / cols);
      positions[`wbs-${item.id}`] = {
        x: cx + (col - (cols - 1) / 2) * COL_OFFSET,
        y: cy - HUB_DIST - (row + 1) * NODE_SPACING - 40,
      };
    });
  }
  if (filter.changes) {
    const items = data.changeLogs;
    const cols = gridCols(items.length);
    items.forEach((c, idx) => {
      const col = idx % cols, row = Math.floor(idx / cols);
      positions[`change-${c.id}`] = {
        x: cx + HUB_DIST + (col + 1) * COL_OFFSET + 30,
        y: cy + (row - (cols - 1) / 2) * NODE_SPACING * 0.8,
      };
    });
  }
  if (filter.meetings) {
    const items = data.meetings;
    const cols = gridCols(items.length);
    items.forEach((m, idx) => {
      const col = idx % cols, row = Math.floor(idx / cols);
      positions[`meeting-${m.id}`] = {
        x: cx + (col - (cols - 1) / 2) * COL_OFFSET,
        y: cy + HUB_DIST + (row + 1) * NODE_SPACING + 40,
      };
    });
  }
  if (filter.dev) {
    const items = data.devInfo;
    const cols = gridCols(items.length);
    items.forEach((d, idx) => {
      const col = idx % cols, row = Math.floor(idx / cols);
      positions[`dev-${d.id}`] = {
        x: cx - HUB_DIST - (col + 1) * COL_OFFSET - 30,
        y: cy + (row - (cols - 1) / 2) * NODE_SPACING * 0.8,
      };
    });
  }
  if (filter.issues) {
    const items = data.issues;
    const cols = gridCols(items.length);
    // NE 대각선 방향 — 각 노드는 (col, row) 를 대각선 회전해 배치
    const dx = Math.SQRT1_2, dy = -Math.SQRT1_2;
    items.forEach((i, idx) => {
      const col = idx % cols, row = Math.floor(idx / cols);
      const radialOffset = (row + 1) * NODE_SPACING + 40;       // hub 외측 방향
      const lateralOffset = (col - (cols - 1) / 2) * COL_OFFSET; // hub 수직 방향
      // perpendicular = (-dy, dx) = (Math.SQRT1_2, Math.SQRT1_2) → SE 방향
      const px = dx, py = dy;
      const qx = -dy, qy = dx;
      positions[`issue-${i.id}`] = {
        x: cx + DIAG + radialOffset * px + lateralOffset * qx,
        y: cy - DIAG + radialOffset * py + lateralOffset * qy,
      };
    });
  }
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
  { key: 'dev',     label: '개발 정보',  strokeColor: '#67e8f9', bgColor: 'rgba(103, 232, 249, 0.05)' },
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
