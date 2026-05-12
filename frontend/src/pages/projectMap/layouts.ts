import type { ChangeLog, DevInfoItem, Meeting, WbsItem } from '../../types';

export type LayoutMode = 'radial' | 'hierarchy' | 'timeline';
export type FilterState = { wbs: boolean; changes: boolean; meetings: boolean; dev: boolean };
export type TimeWindow = { start: string; end: string };
export type Position = { x: number; y: number };
export type DateRange = { min: string; max: string };

export type MapData = {
  wbs: WbsItem[];
  changeLogs: ChangeLog[];
  meetings: Meeting[];
  devInfo: DevInfoItem[];
};

export function flattenWbs(items: WbsItem[]): WbsItem[] {
  return items.flatMap((it) => [it, ...flattenWbs(it.children ?? [])]);
}

// Date the node represents on the timeline.
// WBS: endDate (delivery point) → fall back to startDate.
// ChangeLog / Meeting: their `date`.
// DevInfo: createdAt (no domain date field exists).
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

export function computeDateRange(data: MapData): DateRange | null {
  const all: string[] = [];
  flattenWbs(data.wbs).forEach((w) => { const d = wbsDate(w); if (d) all.push(d.slice(0, 10)); });
  data.changeLogs.forEach((c) => all.push(c.date.slice(0, 10)));
  data.meetings.forEach((m) => all.push(m.date.slice(0, 10)));
  data.devInfo.forEach((d) => all.push(d.createdAt.slice(0, 10)));
  if (all.length === 0) return null;
  all.sort();
  return { min: all[0], max: all[all.length - 1] };
}

// ===== Radial (current layout) =====
const HUB_DIST = 280;
const NODE_SPACING = 80;
const COL_OFFSET = 170;

export function buildRadialPositions(data: MapData, filter: FilterState): Record<string, Position> {
  const cx = 0, cy = 0;
  const positions: Record<string, Position> = {
    project: { x: cx, y: cy },
    'cat-wbs': { x: cx, y: cy - HUB_DIST },
    'cat-changes': { x: cx + HUB_DIST, y: cy },
    'cat-meetings': { x: cx, y: cy + HUB_DIST },
    'cat-dev': { x: cx - HUB_DIST, y: cy },
  };

  if (filter.wbs) {
    flattenWbs(data.wbs).forEach((item, idx) => {
      const col = idx % 3, row = Math.floor(idx / 3);
      positions[`wbs-${item.id}`] = {
        x: cx + (col - 1) * COL_OFFSET,
        y: cy - HUB_DIST - (row + 1) * NODE_SPACING - 40,
      };
    });
  }
  if (filter.changes) {
    data.changeLogs.slice(0, 30).forEach((c, idx) => {
      const col = idx % 3, row = Math.floor(idx / 3);
      positions[`change-${c.id}`] = {
        x: cx + HUB_DIST + (col + 1) * COL_OFFSET + 30,
        y: cy + (row - 4) * NODE_SPACING * 0.8,
      };
    });
  }
  if (filter.meetings) {
    data.meetings.slice(0, 30).forEach((m, idx) => {
      const col = idx % 3, row = Math.floor(idx / 3);
      positions[`meeting-${m.id}`] = {
        x: cx + (col - 1) * COL_OFFSET,
        y: cy + HUB_DIST + (row + 1) * NODE_SPACING + 40,
      };
    });
  }
  if (filter.dev) {
    data.devInfo.slice(0, 30).forEach((d, idx) => {
      const col = idx % 3, row = Math.floor(idx / 3);
      positions[`dev-${d.id}`] = {
        x: cx - HUB_DIST - (col + 1) * COL_OFFSET - 30,
        y: cy + (row - 4) * NODE_SPACING * 0.8,
      };
    });
  }
  return positions;
}

// ===== Timeline =====
export const TIMELINE_WIDTH = 1800;
export const LANE_HEIGHT = 130;
export type LaneKey = 'wbs' | 'change' | 'meeting' | 'dev';
export const LANE_Y: Record<LaneKey, number> = {
  wbs: 0,
  change: LANE_HEIGHT,
  meeting: LANE_HEIGHT * 2,
  dev: LANE_HEIGHT * 3,
};

export const TIMELINE_LANES: { key: LaneKey; label: string; strokeColor: string; bgColor: string }[] = [
  { key: 'wbs',     label: 'WBS',       strokeColor: '#a5b4fc', bgColor: 'rgba(129, 140, 248, 0.05)' },
  { key: 'change',  label: '변경이력',   strokeColor: '#fdba74', bgColor: 'rgba(251, 146, 60, 0.05)' },
  { key: 'meeting', label: '회의록',     strokeColor: '#6ee7b7', bgColor: 'rgba(110, 231, 183, 0.05)' },
  { key: 'dev',     label: '개발 정보',  strokeColor: '#67e8f9', bgColor: 'rgba(103, 232, 249, 0.05)' },
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
    wbs: new Map(), change: new Map(), meeting: new Map(), dev: new Map(),
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
