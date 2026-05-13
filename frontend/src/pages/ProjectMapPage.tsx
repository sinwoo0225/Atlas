import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import cytoscape from 'cytoscape';
// @ts-expect-error - cytoscape-dagre has no types
import dagre from 'cytoscape-dagre';
import type { Core, ElementDefinition, NodeSingular } from 'cytoscape';
import { AlertTriangle, CalendarDays, CalendarRange, Code2, FileText, GitBranch, Maximize2, Minus, Network, Plus, Search, X } from 'lucide-react';
import { Spinner } from '../components/ui';
import { useThemeMode } from '../utils/themeColors';
import { projectsApi } from '../api/projects';
import { wbsApi } from '../api/wbs';
import { changeLogsApi } from '../api/changelogs';
import { meetingsApi } from '../api/meetings';
import { devInfoApi } from '../api/devinfo';
import { issuesApi } from '../api/issues';
import type { ChangeLog, DevInfoItem, Issue, Meeting, Project, WbsItem } from '../types';
import { MapNodePanel, type PanelSelection } from './projectMap/MapNodePanel';
import { MiniMap } from './projectMap/MiniMap';
import { TimelineGuides } from './projectMap/TimelineGuides';
import {
  buildRadialPositions,
  buildTimelinePositions,
  changeDate,
  computeDateRange,
  devDate,
  flattenWbs,
  getLayoutForMode,
  isInTimeline,
  issueDate,
  meetingDate,
  shouldIncludeHubs,
  wbsDate,
  type FilterState,
  type LayoutMode,
  type Position,
  type TimeWindow,
} from './projectMap/layouts';

cytoscape.use(dagre);

type LoadedData = {
  project: Project;
  wbs: WbsItem[];
  changeLogs: ChangeLog[];
  meetings: Meeting[];
  devInfo: DevInfoItem[];
  issues: Issue[];
};

type NodePalette = { fill: string; stroke: string; text: string };
type ThemePalette = {
  project: NodePalette; wbsHub: NodePalette; changeHub: NodePalette; meetingHub: NodePalette; devHub: NodePalette; issueHub: NodePalette;
  wbs: NodePalette; milestone: NodePalette; meeting: NodePalette; dev: NodePalette;
  changeLow: NodePalette; changeMedium: NodePalette; changeHigh: NodePalette; changeCritical: NodePalette;
  issueLow: NodePalette; issueMedium: NodePalette; issueHigh: NodePalette;
  wbsStatusPlanned: string; wbsStatusInProgress: string; wbsStatusDone: string;
  textOutline: string;
  accentGlow: string;
};

const DARK_PALETTE: ThemePalette = {
  project: { fill: '#27272a', stroke: '#a1a1aa', text: '#fafafa' },
  wbsHub:      { fill: '#3730a3', stroke: '#a5b4fc', text: '#eef2ff' },
  changeHub:   { fill: '#9a3412', stroke: '#fdba74', text: '#ffedd5' },
  meetingHub:  { fill: '#065f46', stroke: '#6ee7b7', text: '#d1fae5' },
  devHub:      { fill: '#155e75', stroke: '#67e8f9', text: '#cffafe' },
  issueHub:    { fill: '#9f1239', stroke: '#fda4af', text: '#ffe4e6' },
  wbs:         { fill: '#312e81', stroke: '#818cf8', text: '#e0e7ff' },
  milestone:   { fill: '#4338ca', stroke: '#c7d2fe', text: '#ffffff' },
  meeting:     { fill: '#064e3b', stroke: '#34d399', text: '#a7f3d0' },
  dev:         { fill: '#0e7490', stroke: '#22d3ee', text: '#a5f3fc' },
  changeLow:      { fill: '#15803d', stroke: '#4ade80', text: '#bbf7d0' },
  changeMedium:   { fill: '#a16207', stroke: '#facc15', text: '#fef9c3' },
  changeHigh:     { fill: '#b45309', stroke: '#fb923c', text: '#fed7aa' },
  changeCritical: { fill: '#991b1b', stroke: '#f87171', text: '#fecaca' },
  issueLow:    { fill: '#155e75', stroke: '#67e8f9', text: '#cffafe' },
  issueMedium: { fill: '#a16207', stroke: '#facc15', text: '#fef9c3' },
  issueHigh:   { fill: '#9f1239', stroke: '#fb7185', text: '#ffe4e6' },
  wbsStatusPlanned:    '#6b7280',
  wbsStatusInProgress: '#60a5fa',
  wbsStatusDone:       '#34d399',
  textOutline: '#0a0a0a',
  accentGlow:  '#9eb2ce',
};

const LIGHT_PALETTE: ThemePalette = {
  project: { fill: '#ffffff', stroke: '#52525b', text: '#171717' },
  wbsHub:      { fill: '#e0e7ff', stroke: '#4f46e5', text: '#312e81' },
  changeHub:   { fill: '#ffedd5', stroke: '#c2410c', text: '#7c2d12' },
  meetingHub:  { fill: '#d1fae5', stroke: '#047857', text: '#064e3b' },
  devHub:      { fill: '#cffafe', stroke: '#0e7490', text: '#164e63' },
  issueHub:    { fill: '#ffe4e6', stroke: '#be123c', text: '#9f1239' },
  wbs:         { fill: '#eef2ff', stroke: '#4f46e5', text: '#312e81' },
  milestone:   { fill: '#c7d2fe', stroke: '#4338ca', text: '#1e1b4b' },
  meeting:     { fill: '#d1fae5', stroke: '#059669', text: '#064e3b' },
  dev:         { fill: '#cffafe', stroke: '#0891b2', text: '#164e63' },
  changeLow:      { fill: '#dcfce7', stroke: '#16a34a', text: '#14532d' },
  changeMedium:   { fill: '#fef9c3', stroke: '#ca8a04', text: '#713f12' },
  changeHigh:     { fill: '#fed7aa', stroke: '#ea580c', text: '#7c2d12' },
  changeCritical: { fill: '#fecaca', stroke: '#dc2626', text: '#7f1d1d' },
  issueLow:    { fill: '#cffafe', stroke: '#0891b2', text: '#164e63' },
  issueMedium: { fill: '#fef9c3', stroke: '#ca8a04', text: '#713f12' },
  issueHigh:   { fill: '#fecdd3', stroke: '#e11d48', text: '#881337' },
  wbsStatusPlanned:    '#9ca3af',
  wbsStatusInProgress: '#3b82f6',
  wbsStatusDone:       '#10b981',
  textOutline: '#ffffff',
  accentGlow:  '#5b7299',
};

const SELECTED_GLOW = '#fbbf24';

const MODES: { key: LayoutMode; label: string; title: string }[] = [
  { key: 'radial',    label: '방사형',   title: '방사형 레이아웃 — 중앙 프로젝트, 사방 카테고리' },
  { key: 'hierarchy', label: '계층',     title: '계층 레이아웃 (dagre) — 프로젝트→카테고리→항목 트리' },
  { key: 'timeline',  label: '타임라인', title: '타임라인 레이아웃 — 좌→우 시간축, 위→아래 카테고리 레인' },
];

function resolveSelection(nodeId: string, data: LoadedData): PanelSelection | null {
  if (nodeId === 'project') {
    return {
      kind: 'project',
      entity: data.project,
      counts: {
        wbs: flattenWbs(data.wbs).length,
        changes: data.changeLogs.length,
        meetings: data.meetings.length,
        dev: data.devInfo.length,
        issues: data.issues.length,
      },
    };
  }
  const m = nodeId.match(/^(wbs|change|meeting|dev|issue)-(\d+)$/);
  if (!m) return null;
  const itemId = parseInt(m[2]);
  switch (m[1]) {
    case 'wbs': {
      const e = flattenWbs(data.wbs).find((w) => w.id === itemId);
      return e ? { kind: 'wbs', entity: e } : null;
    }
    case 'change': {
      const e = data.changeLogs.find((c) => c.id === itemId);
      return e ? { kind: 'change', entity: e } : null;
    }
    case 'meeting': {
      const e = data.meetings.find((mt) => mt.id === itemId);
      return e ? { kind: 'meeting', entity: e } : null;
    }
    case 'dev': {
      const e = data.devInfo.find((d) => d.id === itemId);
      return e ? { kind: 'dev', entity: e } : null;
    }
    case 'issue': {
      const e = data.issues.find((i) => i.id === itemId);
      return e ? { kind: 'issue', entity: e } : null;
    }
  }
  return null;
}

function listingRouteFor(nodeId: string): string | null {
  if (nodeId === 'project') return 'dashboard';
  if (nodeId === 'cat-wbs' || nodeId.startsWith('wbs-')) return 'wbs';
  if (nodeId === 'cat-changes' || nodeId.startsWith('change-')) return 'changelogs';
  if (nodeId === 'cat-meetings' || nodeId.startsWith('meeting-')) return 'meetings';
  if (nodeId === 'cat-dev' || nodeId.startsWith('dev-')) return 'devinfo';
  if (nodeId === 'cat-issues' || nodeId.startsWith('issue-')) return 'issues';
  return null;
}

function selectionDomId(sel: PanelSelection): string {
  switch (sel.kind) {
    case 'project': return 'project';
    case 'wbs': return `wbs-${sel.entity.id}`;
    case 'change': return `change-${sel.entity.id}`;
    case 'meeting': return `meeting-${sel.entity.id}`;
    case 'dev': return `dev-${sel.entity.id}`;
    case 'issue': return `issue-${sel.entity.id}`;
  }
}

export function ProjectMapPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const pid = parseInt(projectId!);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const tapTimerRef = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<LoadedData | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterState>({ wbs: true, changes: true, meetings: true, dev: true, issues: true });
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PanelSelection | null>(null);
  const [mode, setMode] = useState<LayoutMode>('radial');
  const [timeWindow, setTimeWindow] = useState<TimeWindow | null>(null);
  // Bumped each time the cy instance is rebuilt so child overlays can re-subscribe.
  const [cyVersion, setCyVersion] = useState(0);

  const theme = useThemeMode();
  const PALETTE = useMemo(() => (theme === 'light' ? LIGHT_PALETTE : DARK_PALETTE), [theme]);

  useEffect(() => {
    if (!pid || isNaN(pid)) return;
    Promise.all([
      projectsApi.getById(pid),
      wbsApi.getByProject(pid),
      changeLogsApi.getByProject(pid),
      meetingsApi.getByProject(pid),
      devInfoApi.getByProject(pid),
      issuesApi.getByProject(pid),
    ])
      .then(([project, wbs, changeLogs, meetings, devInfo, issues]) => {
        setData({ project, wbs, changeLogs, meetings, devInfo, issues });
      })
      .catch(() => setError('맵 데이터를 불러올 수 없습니다.'));
  }, [pid]);

  const dateRange = useMemo(() => (data ? computeDateRange(data) : null), [data]);
  const effectiveWindow: TimeWindow | null =
    timeWindow ?? (dateRange ? { start: dateRange.min, end: dateRange.max } : null);
  const windowStart = effectiveWindow?.start ?? null;
  const windowEnd = effectiveWindow?.end ?? null;

  // Reset time window when switching projects (React's "reset on prop change" pattern).
  const [trackedPid, setTrackedPid] = useState(pid);
  if (trackedPid !== pid) {
    setTrackedPid(pid);
    setTimeWindow(null);
  }

  // Build / rebuild Cytoscape when relevant inputs change.
  useEffect(() => {
    if (!data || !containerRef.current) return;

    const elements: ElementDefinition[] = [];
    const includeHubs = shouldIncludeHubs(mode);
    const tlWindow: TimeWindow | null =
      mode === 'timeline' && windowStart && windowEnd ? { start: windowStart, end: windowEnd } : null;

    const positions: Record<string, Position> | null =
      mode === 'hierarchy'
        ? null
        : mode === 'timeline' && tlWindow
          ? buildTimelinePositions(data, filter, tlWindow)
          : buildRadialPositions(data, filter);

    const posOf = (id: string): { position?: Position } =>
      positions && positions[id] ? { position: positions[id] } : {};

    // Project hub + category hubs (non-timeline modes only)
    if (includeHubs) {
      elements.push({
        data: { id: 'project', label: data.project.name, kind: 'project', size: 100, tooltip: `프로젝트 · ${data.project.name}` },
        ...posOf('project'),
      });
      const categories = [
        { id: 'cat-wbs',      label: 'WBS',       kind: 'wbs-hub',     visible: filter.wbs,      count: flattenWbs(data.wbs).length },
        { id: 'cat-changes',  label: '변경이력',   kind: 'change-hub',  visible: filter.changes,  count: data.changeLogs.length },
        { id: 'cat-meetings', label: '회의록',     kind: 'meeting-hub', visible: filter.meetings, count: data.meetings.length },
        { id: 'cat-dev',      label: '개발 정보',  kind: 'dev-hub',     visible: filter.dev,      count: data.devInfo.length },
        { id: 'cat-issues',   label: '이슈',       kind: 'issue-hub',   visible: filter.issues,   count: data.issues.length },
      ];
      for (const cat of categories) {
        if (!cat.visible) continue;
        elements.push({
          data: { id: cat.id, label: `${cat.label}\n(${cat.count})`, kind: cat.kind, size: 70, tooltip: `카테고리 · ${cat.label} (${cat.count}건)` },
          ...posOf(cat.id),
        });
        elements.push({ data: { id: `e-project-${cat.id}`, source: 'project', target: cat.id, kind: 'cat-edge' } });
      }
    }

    // WBS items
    if (filter.wbs) {
      const allWbs = flattenWbs(data.wbs);
      const included = new Set<number>();
      for (const item of allWbs) {
        const id = `wbs-${item.id}`;
        const d = wbsDate(item);
        if (mode === 'timeline') {
          if (!tlWindow || !isInTimeline(d, tlWindow)) continue;
        }
        included.add(item.id);
        const dateLabel = item.endDate?.slice(0, 10) ?? '-';
        elements.push({
          data: {
            id,
            label: item.name + (item.isMilestone ? ' ◆' : ''),
            kind: item.isMilestone ? 'milestone' : 'wbs',
            status: item.status,
            size: item.isMilestone ? 42 : 34,
            date: d ?? null,
            tooltip: `${item.isMilestone ? '마일스톤' : 'WBS'} · ${item.name}\n상태: ${item.status} / 종료: ${dateLabel}\n담당: ${item.assignee || '-'}`,
          },
          ...posOf(id),
        });
      }
      // Parent-child WBS edges (only between included nodes)
      for (const item of allWbs) {
        if (!included.has(item.id)) continue;
        const targetId = `wbs-${item.id}`;
        if (item.parentId && included.has(item.parentId)) {
          const parentId = `wbs-${item.parentId}`;
          elements.push({ data: { id: `e-${parentId}-${targetId}`, source: parentId, target: targetId, kind: 'wbs-edge' } });
        } else if (mode !== 'timeline' && includeHubs) {
          elements.push({ data: { id: `e-cat-wbs-${targetId}`, source: 'cat-wbs', target: targetId, kind: 'wbs-edge' } });
        }
      }
    }

    // ChangeLogs
    if (filter.changes) {
      const items = data.changeLogs;
      for (const c of items) {
        const id = `change-${c.id}`;
        const d = changeDate(c);
        if (mode === 'timeline' && (!tlWindow || !isInTimeline(d, tlWindow))) continue;
        const label = c.content.length > 24 ? c.content.slice(0, 24) + '…' : c.content;
        elements.push({
          data: { id, label, kind: 'change', impact: c.impact, size: 32, date: d, tooltip: `변경이력 · ${c.impact}\n${c.content}\n${d.slice(0, 10)}` },
          ...posOf(id),
        });
        if (mode !== 'timeline' && includeHubs) {
          elements.push({ data: { id: `e-cat-changes-${id}`, source: 'cat-changes', target: id, kind: 'change-edge' } });
        }
      }
    }

    // Meetings
    if (filter.meetings) {
      const items = data.meetings;
      for (const m of items) {
        const id = `meeting-${m.id}`;
        const d = meetingDate(m);
        if (mode === 'timeline' && (!tlWindow || !isInTimeline(d, tlWindow))) continue;
        const label = m.topic.length > 24 ? m.topic.slice(0, 24) + '…' : m.topic;
        elements.push({
          data: { id, label, kind: 'meeting', size: 32, date: d, tooltip: `회의록 · ${m.topic}\n${d.slice(0, 10)}` },
          ...posOf(id),
        });
        if (mode !== 'timeline' && includeHubs) {
          elements.push({ data: { id: `e-cat-meetings-${id}`, source: 'cat-meetings', target: id, kind: 'meeting-edge' } });
        }
      }
    }

    // DevInfo
    if (filter.dev) {
      const items = data.devInfo;
      for (const dv of items) {
        const id = `dev-${dv.id}`;
        const d = devDate(dv);
        if (mode === 'timeline' && (!tlWindow || !isInTimeline(d, tlWindow))) continue;
        const label = dv.title.length > 24 ? dv.title.slice(0, 24) + '…' : dv.title;
        elements.push({
          data: { id, label, kind: 'dev', size: 32, date: d, tooltip: `개발 정보 · ${dv.type}\n${dv.title}` },
          ...posOf(id),
        });
        if (mode !== 'timeline' && includeHubs) {
          elements.push({ data: { id: `e-cat-dev-${id}`, source: 'cat-dev', target: id, kind: 'dev-edge' } });
        }
      }
    }

    // Issues
    if (filter.issues) {
      const items = data.issues;
      for (const it of items) {
        const id = `issue-${it.id}`;
        const d = issueDate(it);
        if (mode === 'timeline' && (!d || !tlWindow || !isInTimeline(d, tlWindow))) continue;
        const label = it.title.length > 24 ? it.title.slice(0, 24) + '…' : it.title;
        const due = it.dueDate?.slice(0, 10) ?? '-';
        elements.push({
          data: {
            id,
            label,
            kind: 'issue',
            priority: it.priority,
            issueStatus: it.status,
            size: 32,
            date: d ?? null,
            tooltip: `이슈 · ${it.priority} / ${it.status}\n${it.title}\n마감: ${due}`,
          },
          ...posOf(id),
        });
        if (mode !== 'timeline' && includeHubs) {
          elements.push({ data: { id: `e-cat-issues-${id}`, source: 'cat-issues', target: id, kind: 'issue-edge' } });
        }
      }
    }

    if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            color: '#f4f4f5',
            'font-size': '12px',
            'font-family': 'Pretendard, Inter, Segoe UI, sans-serif',
            'font-weight': 500,
            'text-wrap': 'wrap',
            'text-max-width': '120px',
            'text-outline-color': PALETTE.textOutline,
            'text-outline-width': 1,
            width: 'data(size)',
            height: 'data(size)',
            'background-color': '#27272a',
            'background-opacity': 1,
            'border-color': '#52525b',
            'border-width': 2,
            shape: 'round-rectangle',
            'corner-radius': '12' as any,
            'shadow-blur': 14,
            'shadow-color': '#000000',
            'shadow-opacity': 0.45,
            'shadow-offset-x': 0,
            'shadow-offset-y': 3,
          } as any,
        },
        { selector: 'node[kind = "project"]',     style: { 'background-color': PALETTE.project.fill, 'border-color': PALETTE.project.stroke, color: PALETTE.project.text, 'font-size': '16px', 'font-weight': 800, 'border-width': 3, 'shadow-blur': 24, 'shadow-color': PALETTE.accentGlow, 'shadow-opacity': 0.5 } as any },
        { selector: 'node[kind = "wbs-hub"]',     style: { 'background-color': PALETTE.wbsHub.fill,     'border-color': PALETTE.wbsHub.stroke,     color: PALETTE.wbsHub.text,     'font-weight': 700, 'border-width': 2.5 } as any },
        { selector: 'node[kind = "change-hub"]',  style: { 'background-color': PALETTE.changeHub.fill,  'border-color': PALETTE.changeHub.stroke,  color: PALETTE.changeHub.text,  'font-weight': 700, 'border-width': 2.5 } as any },
        { selector: 'node[kind = "meeting-hub"]', style: { 'background-color': PALETTE.meetingHub.fill, 'border-color': PALETTE.meetingHub.stroke, color: PALETTE.meetingHub.text, 'font-weight': 700, 'border-width': 2.5 } as any },
        { selector: 'node[kind = "dev-hub"]',     style: { 'background-color': PALETTE.devHub.fill,     'border-color': PALETTE.devHub.stroke,     color: PALETTE.devHub.text,     'font-weight': 700, 'border-width': 2.5 } as any },
        { selector: 'node[kind = "issue-hub"]',   style: { 'background-color': PALETTE.issueHub.fill,   'border-color': PALETTE.issueHub.stroke,   color: PALETTE.issueHub.text,   'font-weight': 700, 'border-width': 2.5 } as any },
        { selector: 'node[kind = "wbs"]',         style: { 'background-color': PALETTE.wbs.fill,         'border-color': PALETTE.wbs.stroke,         color: PALETTE.wbs.text } as any },
        { selector: 'node[kind = "milestone"]',   style: { 'background-color': PALETTE.milestone.fill,   'border-color': PALETTE.milestone.stroke,   color: PALETTE.milestone.text, shape: 'diamond' } as any },
        { selector: 'node[kind = "meeting"]',     style: { 'background-color': PALETTE.meeting.fill,     'border-color': PALETTE.meeting.stroke,     color: PALETTE.meeting.text } as any },
        { selector: 'node[kind = "dev"]',         style: { 'background-color': PALETTE.dev.fill,         'border-color': PALETTE.dev.stroke,         color: PALETTE.dev.text } as any },
        { selector: 'node[kind = "change"][impact = "Low"]',      style: { 'background-color': PALETTE.changeLow.fill,      'border-color': PALETTE.changeLow.stroke,      color: PALETTE.changeLow.text } as any },
        { selector: 'node[kind = "change"][impact = "Medium"]',   style: { 'background-color': PALETTE.changeMedium.fill,   'border-color': PALETTE.changeMedium.stroke,   color: PALETTE.changeMedium.text } as any },
        { selector: 'node[kind = "change"][impact = "High"]',     style: { 'background-color': PALETTE.changeHigh.fill,     'border-color': PALETTE.changeHigh.stroke,     color: PALETTE.changeHigh.text } as any },
        { selector: 'node[kind = "change"][impact = "Critical"]', style: { 'background-color': PALETTE.changeCritical.fill, 'border-color': PALETTE.changeCritical.stroke, color: PALETTE.changeCritical.text } as any },
        // Issue priority colors (mirrors ChangeLog impact pattern)
        { selector: 'node[kind = "issue"]',                          style: { 'background-color': PALETTE.issueMedium.fill, 'border-color': PALETTE.issueMedium.stroke, color: PALETTE.issueMedium.text } as any },
        { selector: 'node[kind = "issue"][priority = "Low"]',        style: { 'background-color': PALETTE.issueLow.fill,    'border-color': PALETTE.issueLow.stroke,    color: PALETTE.issueLow.text } as any },
        { selector: 'node[kind = "issue"][priority = "Medium"]',     style: { 'background-color': PALETTE.issueMedium.fill, 'border-color': PALETTE.issueMedium.stroke, color: PALETTE.issueMedium.text } as any },
        { selector: 'node[kind = "issue"][priority = "High"]',       style: { 'background-color': PALETTE.issueHigh.fill,   'border-color': PALETTE.issueHigh.stroke,   color: PALETTE.issueHigh.text } as any },
        // Closed/Resolved issues — dim slightly so attention is on open ones
        { selector: 'node[kind = "issue"][issueStatus = "Closed"]',   style: { opacity: 0.55 } as any },
        { selector: 'node[kind = "issue"][issueStatus = "Resolved"]', style: { opacity: 0.75 } as any },
        // WBS status border tint (Planned / InProgress / Done) — applied to non-milestone wbs only
        { selector: 'node[kind = "wbs"][status = "Planned"]',    style: { 'border-color': PALETTE.wbsStatusPlanned } as any },
        { selector: 'node[kind = "wbs"][status = "InProgress"]', style: { 'border-color': PALETTE.wbsStatusInProgress } as any },
        { selector: 'node[kind = "wbs"][status = "Done"]',       style: { 'border-color': PALETTE.wbsStatusDone, opacity: 0.75 } as any },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#3f3f46',
            'curve-style': 'unbundled-bezier',
            'control-point-distances': [20],
            'control-point-weights': [0.5],
            opacity: 0.85,
          } as any,
        },
        { selector: 'edge[kind = "cat-edge"]',     style: { width: 3, 'line-color': PALETTE.accentGlow, opacity: 0.9 } as any },
        { selector: 'edge[kind = "wbs-edge"]',     style: { 'line-color': PALETTE.wbsHub.stroke,     opacity: 0.6 } as any },
        { selector: 'edge[kind = "change-edge"]',  style: { 'line-color': PALETTE.changeHub.stroke,  opacity: 0.6 } as any },
        { selector: 'edge[kind = "meeting-edge"]', style: { 'line-color': PALETTE.meetingHub.stroke, opacity: 0.6 } as any },
        { selector: 'edge[kind = "dev-edge"]',     style: { 'line-color': PALETTE.devHub.stroke,     opacity: 0.6 } as any },
        { selector: 'edge[kind = "issue-edge"]',   style: { 'line-color': PALETTE.issueHub.stroke,   opacity: 0.6 } as any },
        // Phase A: dim + selection states (must come last so they win the cascade)
        { selector: '.search-dim, .hover-dim', style: { opacity: 0.12 } as any },
        { selector: 'node.selected-map-node', style: { 'border-width': 4, 'border-color': SELECTED_GLOW, 'shadow-blur': 28, 'shadow-color': SELECTED_GLOW, 'shadow-opacity': 0.7 } as any },
        { selector: 'node.search-hit', style: { 'border-width': 3.5, 'border-color': SELECTED_GLOW } as any },
      ],
      layout: getLayoutForMode(mode) as any,
      wheelSensitivity: 0.2,
    });

    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target as NodeSingular;
      cy.elements().addClass('hover-dim');
      node.closedNeighborhood().removeClass('hover-dim');
      const t = node.data('tooltip');
      if (t && tooltipRef.current) {
        tooltipRef.current.textContent = t;
        tooltipRef.current.style.display = 'block';
      }
    });
    cy.on('mousemove', 'node', (evt) => {
      if (!tooltipRef.current || !containerRef.current) return;
      const orig = evt.originalEvent as MouseEvent;
      const rect = containerRef.current.getBoundingClientRect();
      tooltipRef.current.style.left = `${orig.clientX - rect.left + 14}px`;
      tooltipRef.current.style.top = `${orig.clientY - rect.top + 14}px`;
    });
    cy.on('mouseout', 'node', () => {
      cy.elements().removeClass('hover-dim');
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    });

    cy.on('tap', 'node', (evt) => {
      const node = evt.target as NodeSingular;
      if (tapTimerRef.current != null) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      tapTimerRef.current = window.setTimeout(() => {
        tapTimerRef.current = null;
        const id: string = node.data('id');
        if (id.startsWith('cat-')) {
          const r = listingRouteFor(id);
          if (r) navigate(`/projects/${pid}/${r}`);
          return;
        }
        const sel = resolveSelection(id, data);
        if (sel) {
          setSelected(sel);
          cy.nodes('.selected-map-node').removeClass('selected-map-node');
          node.addClass('selected-map-node');
        }
      }, 260);
    });

    cy.on('dbltap', 'node', (evt) => {
      if (tapTimerRef.current != null) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      const id: string = evt.target.data('id');
      const r = listingRouteFor(id);
      if (r) navigate(`/projects/${pid}/${r}`);
    });

    cy.fit(undefined, 60);
    cyRef.current = cy;
    // Notify overlays (TimelineGuides, MiniMap) that cy was rebuilt so they can re-subscribe.
    setCyVersion((v) => v + 1);

    return () => {
      if (tapTimerRef.current != null) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      cy.destroy();
      cyRef.current = null;
    };
  }, [data, filter, pid, navigate, mode, windowStart, windowEnd, PALETTE]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes('.selected-map-node').removeClass('selected-map-node');
    if (selected) {
      const n = cy.getElementById(selectionDomId(selected));
      if (n && n.length > 0) n.addClass('selected-map-node');
    }
  }, [selected, data, filter, mode, windowStart, windowEnd, theme]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const q = query.trim().toLowerCase();
    if (!q) {
      cy.elements().removeClass('search-dim').removeClass('search-hit');
      return;
    }
    cy.nodes().forEach((n) => {
      const label = String(n.data('label') ?? '').toLowerCase();
      const tip = String(n.data('tooltip') ?? '').toLowerCase();
      const hit = label.includes(q) || tip.includes(q);
      n.toggleClass('search-dim', !hit);
      n.toggleClass('search-hit', hit);
    });
    cy.edges().forEach((e) => {
      const dim = e.source().hasClass('search-dim') || e.target().hasClass('search-dim');
      e.toggleClass('search-dim', dim);
    });
  }, [query, data, filter, mode, windowStart, windowEnd, theme]);

  useEffect(() => {
    const t = setTimeout(() => cyRef.current?.fit(undefined, 60), 60);
    return () => clearTimeout(t);
  }, [filter, mode]);

  const toggleFilter = useCallback((k: keyof FilterState) => {
    setFilter((f) => ({ ...f, [k]: !f[k] }));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable;
      if (e.key === 'Escape') {
        if (selected) { setSelected(null); e.preventDefault(); return; }
        if (query) { setQuery(''); e.preventDefault(); return; }
        if (isTyping) target?.blur();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        searchRef.current?.focus();
        searchRef.current?.select();
        e.preventDefault();
        return;
      }
      if (isTyping) return;
      if (e.key === '/') {
        searchRef.current?.focus();
        e.preventDefault();
        return;
      }
      if (e.key === 'f' || e.key === 'F') { cyRef.current?.fit(undefined, 60); return; }
      if (e.key === '1') { toggleFilter('wbs'); return; }
      if (e.key === '2') { toggleFilter('changes'); return; }
      if (e.key === '3') { toggleFilter('meetings'); return; }
      if (e.key === '4') { toggleFilter('dev'); return; }
      if (e.key === '5') { toggleFilter('issues'); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, query, toggleFilter]);

  const legendItems = useMemo(() => [
    { key: 'wbs',      label: 'WBS',       color: PALETTE.wbsHub.stroke },
    { key: 'changes',  label: '변경이력',   color: PALETTE.changeHub.stroke },
    { key: 'meetings', label: '회의록',     color: PALETTE.meetingHub.stroke },
    { key: 'dev',      label: '개발 정보',  color: PALETTE.devHub.stroke },
    { key: 'issues',   label: '이슈',       color: PALETTE.issueHub.stroke },
  ], [PALETTE]);

  if (error) return <div className="p-6 text-sm text-on-danger">{error}</div>;
  if (!data) return <div className="p-6"><Spinner label="로딩 중..." /></div>;

  const btnClass = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors border ${
      active
        ? 'bg-[#5b7299] text-white border-[#6b82a8]'
        : 'bg-surface-2 text-secondary border-default hover:bg-surface-3'
    }`;

  const modeBtnClass = (active: boolean) =>
    `px-3 py-1.5 text-sm transition-colors ${
      active ? 'bg-[#5b7299] text-white' : 'text-secondary hover:bg-surface-3'
    }`;

  const showTimelineEmpty = mode === 'timeline' && (!dateRange || elementCountInWindow(data, filter, effectiveWindow) === 0);

  return (
    <div className="p-6 h-full flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="h-page flex items-center gap-2">
          <Network size={18} className="text-muted" />
          프로젝트 맵
        </h1>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="inline-flex rounded-md border border-default overflow-hidden bg-surface-2">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={modeBtnClass(mode === m.key)}
                title={m.title}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="검색…  (/)"
              className="pl-8 pr-7 py-1.5 text-sm rounded-md w-56"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); searchRef.current?.focus(); }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted hover:text-primary hover:bg-surface-3"
                title="검색 초기화 (Esc)"
                aria-label="검색 초기화"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button onClick={() => toggleFilter('wbs')} className={btnClass(filter.wbs)} title="WBS 토글 (1)">
            <CalendarDays size={14} /> WBS
          </button>
          <button onClick={() => toggleFilter('changes')} className={btnClass(filter.changes)} title="변경이력 토글 (2)">
            <GitBranch size={14} /> 변경
          </button>
          <button onClick={() => toggleFilter('meetings')} className={btnClass(filter.meetings)} title="회의록 토글 (3)">
            <FileText size={14} /> 회의
          </button>
          <button onClick={() => toggleFilter('dev')} className={btnClass(filter.dev)} title="개발 정보 토글 (4)">
            <Code2 size={14} /> 개발
          </button>
          <button onClick={() => toggleFilter('issues')} className={btnClass(filter.issues)} title="이슈 토글 (5)">
            <AlertTriangle size={14} /> 이슈
          </button>
          <div className="inline-flex rounded-md border border-default overflow-hidden bg-surface-2">
            <button
              onClick={() => zoomBy(cyRef.current, 1 / 1.25)}
              className="px-2 py-1.5 text-secondary hover:text-primary hover:bg-surface-3 border-r border-default"
              title="축소"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={() => zoomBy(cyRef.current, 1.25)}
              className="px-2 py-1.5 text-secondary hover:text-primary hover:bg-surface-3"
              title="확대"
            >
              <Plus size={14} />
            </button>
          </div>
          <button
            onClick={() => cyRef.current?.fit(undefined, 60)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-surface-2 text-secondary hover:bg-surface-3 border border-default"
            title="화면 맞춤 (f)"
          >
            <Maximize2 size={14} /> 화면 맞춤
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted flex-wrap">
        <span>범례</span>
        {legendItems.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: l.color }} />
            {l.label}
          </span>
        ))}
        <span className="ml-auto text-[11px] text-muted">
          클릭 → 패널 · 더블클릭 → 페이지 · <kbd>/</kbd> 검색 · <kbd>f</kbd> 맞춤 · <kbd>1~5</kbd> 필터 · <kbd>Esc</kbd> 닫기
        </span>
      </div>

      {mode === 'timeline' && (
        <div className="flex items-center gap-2 text-xs bg-surface-2 border border-default rounded-md px-3 py-2 flex-wrap">
          <CalendarRange size={14} className="text-accent" />
          <span className="text-muted">기간</span>
          <input
            type="date"
            value={effectiveWindow?.start ?? ''}
            min={dateRange?.min}
            max={effectiveWindow?.end ?? dateRange?.max}
            disabled={!dateRange}
            onChange={(e) => {
              if (!e.target.value || !effectiveWindow) return;
              setTimeWindow({ start: e.target.value, end: effectiveWindow.end });
            }}
            className="px-2 py-0.5 text-xs"
          />
          <span className="text-muted">~</span>
          <input
            type="date"
            value={effectiveWindow?.end ?? ''}
            min={effectiveWindow?.start ?? dateRange?.min}
            max={dateRange?.max}
            disabled={!dateRange}
            onChange={(e) => {
              if (!e.target.value || !effectiveWindow) return;
              setTimeWindow({ start: effectiveWindow.start, end: e.target.value });
            }}
            className="px-2 py-0.5 text-xs"
          />
          <button
            onClick={() => setTimeWindow(null)}
            className="px-2 py-0.5 rounded text-secondary hover:text-primary hover:bg-surface-3 border border-default disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={timeWindow === null}
            title="전체 범위로 복원"
          >
            전체
          </button>
          <span className="ml-auto text-muted">
            {dateRange ? `전체 데이터: ${dateRange.min} ~ ${dateRange.max}` : '날짜 데이터 없음'}
          </span>
        </div>
      )}

      <div className="flex-1 relative bg-surface border border-default rounded-lg overflow-hidden min-h-0">
        <div
          ref={containerRef}
          className="w-full h-full"
          style={{
            minHeight: 500,
            backgroundImage: 'radial-gradient(circle at center, var(--bg-surface) 0%, var(--bg-base) 75%)',
          }}
        />
        {mode === 'timeline' && (
          <TimelineGuides cyRef={cyRef} cyVersion={cyVersion} window={effectiveWindow} />
        )}
        <MiniMap cyRef={cyRef} cyVersion={cyVersion} />
        {showTimelineEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-sm text-muted bg-surface-2/80 backdrop-blur px-4 py-2 rounded-md border border-default">
              타임라인에 표시할 항목이 없습니다.
            </div>
          </div>
        )}
        <div
          ref={tooltipRef}
          className="absolute pointer-events-none z-10 px-2.5 py-1.5 rounded-md text-xs whitespace-pre bg-surface-2 border border-strong text-primary shadow-lg"
          style={{ display: 'none' }}
        />
        <MapNodePanel selection={selected} projectId={pid} onClose={() => setSelected(null)} />
      </div>
    </div>
  );
}

// Zoom around the canvas center while preserving the focal point.
function zoomBy(cy: Core | null, factor: number): void {
  if (!cy) return;
  const container = cy.container();
  if (!container) return;
  const w = container.clientWidth;
  const h = container.clientHeight;
  cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: w / 2, y: h / 2 } });
}

function elementCountInWindow(data: LoadedData, filter: FilterState, w: TimeWindow | null): number {
  if (!w) return 0;
  let n = 0;
  if (filter.wbs) flattenWbs(data.wbs).forEach((it) => { if (isInTimeline(wbsDate(it), w)) n++; });
  if (filter.changes) data.changeLogs.forEach((c) => { if (isInTimeline(changeDate(c), w)) n++; });
  if (filter.meetings) data.meetings.forEach((m) => { if (isInTimeline(meetingDate(m), w)) n++; });
  if (filter.dev) data.devInfo.forEach((d) => { if (isInTimeline(devDate(d), w)) n++; });
  if (filter.issues) data.issues.forEach((i) => { if (isInTimeline(issueDate(i), w)) n++; });
  return n;
}
