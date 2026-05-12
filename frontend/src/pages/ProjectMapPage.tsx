import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import cytoscape from 'cytoscape';
// @ts-expect-error - cytoscape-dagre has no types
import dagre from 'cytoscape-dagre';
import type { Core, ElementDefinition } from 'cytoscape';
import { Network, CalendarDays, GitBranch, FileText, Code2, Maximize2 } from 'lucide-react';
import { projectsApi } from '../api/projects';
import { wbsApi } from '../api/wbs';
import { changeLogsApi } from '../api/changelogs';
import { meetingsApi } from '../api/meetings';
import { devInfoApi } from '../api/devinfo';
import type { Project, WbsItem, ChangeLog, Meeting, DevInfoItem } from '../types';

cytoscape.use(dagre);

type LoadedData = {
  project: Project;
  wbs: WbsItem[];
  changeLogs: ChangeLog[];
  meetings: Meeting[];
  devInfo: DevInfoItem[];
};

function flattenWbs(items: WbsItem[]): WbsItem[] {
  return items.flatMap((it) => [it, ...flattenWbs(it.children ?? [])]);
}

// Category palette — saturated fill + darker border for hub, soft fill for leaves.
const PALETTE = {
  project: { fill: '#27272a', stroke: '#a1a1aa', text: '#fafafa' },
  wbsHub:      { fill: '#3730a3', stroke: '#a5b4fc', text: '#eef2ff' }, // indigo
  changeHub:   { fill: '#9a3412', stroke: '#fdba74', text: '#ffedd5' }, // orange
  meetingHub:  { fill: '#065f46', stroke: '#6ee7b7', text: '#d1fae5' }, // emerald
  devHub:      { fill: '#155e75', stroke: '#67e8f9', text: '#cffafe' }, // cyan
  wbs:         { fill: '#312e81', stroke: '#818cf8', text: '#e0e7ff' },
  milestone:   { fill: '#4338ca', stroke: '#c7d2fe', text: '#ffffff' },
  meeting:     { fill: '#064e3b', stroke: '#34d399', text: '#a7f3d0' },
  dev:         { fill: '#0e7490', stroke: '#22d3ee', text: '#a5f3fc' },
  changeLow:      { fill: '#15803d', stroke: '#4ade80', text: '#bbf7d0' },
  changeMedium:   { fill: '#a16207', stroke: '#facc15', text: '#fef9c3' },
  changeHigh:     { fill: '#b45309', stroke: '#fb923c', text: '#fed7aa' },
  changeCritical: { fill: '#991b1b', stroke: '#f87171', text: '#fecaca' },
};

function buildPositions(
  data: LoadedData,
  filter: { wbs: boolean; changes: boolean; meetings: boolean; dev: boolean },
) {
  const cx = 0, cy = 0;
  const HUB_DIST = 280;
  const NODE_SPACING = 80;
  const COL_OFFSET = 170;

  const positions: Record<string, { x: number; y: number }> = {
    project: { x: cx, y: cy },
    'cat-wbs': { x: cx, y: cy - HUB_DIST },
    'cat-changes': { x: cx + HUB_DIST, y: cy },
    'cat-meetings': { x: cx, y: cy + HUB_DIST },
    'cat-dev': { x: cx - HUB_DIST, y: cy },
  };

  if (filter.wbs) {
    flattenWbs(data.wbs).forEach((item, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      positions[`wbs-${item.id}`] = {
        x: cx + (col - 1) * COL_OFFSET,
        y: cy - HUB_DIST - (row + 1) * NODE_SPACING - 40,
      };
    });
  }
  if (filter.changes) {
    data.changeLogs.slice(0, 30).forEach((c, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      positions[`change-${c.id}`] = {
        x: cx + HUB_DIST + (col + 1) * COL_OFFSET + 30,
        y: cy + (row - 4) * NODE_SPACING * 0.8,
      };
    });
  }
  if (filter.meetings) {
    data.meetings.slice(0, 30).forEach((m, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      positions[`meeting-${m.id}`] = {
        x: cx + (col - 1) * COL_OFFSET,
        y: cy + HUB_DIST + (row + 1) * NODE_SPACING + 40,
      };
    });
  }
  if (filter.dev) {
    data.devInfo.slice(0, 30).forEach((d, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      positions[`dev-${d.id}`] = {
        x: cx - HUB_DIST - (col + 1) * COL_OFFSET - 30,
        y: cy + (row - 4) * NODE_SPACING * 0.8,
      };
    });
  }
  return positions;
}

export function ProjectMapPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const pid = parseInt(projectId!);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [data, setData] = useState<LoadedData | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState({ wbs: true, changes: true, meetings: true, dev: true });

  useEffect(() => {
    if (!pid || isNaN(pid)) return;
    Promise.all([
      projectsApi.getById(pid),
      wbsApi.getByProject(pid),
      changeLogsApi.getByProject(pid),
      meetingsApi.getByProject(pid),
      devInfoApi.getByProject(pid),
    ])
      .then(([project, wbs, changeLogs, meetings, devInfo]) => {
        setData({ project, wbs, changeLogs, meetings, devInfo });
      })
      .catch(() => setError('맵 데이터를 불러올 수 없습니다.'));
  }, [pid]);

  useEffect(() => {
    if (!data || !containerRef.current) return;

    const elements: ElementDefinition[] = [];
    const positions = buildPositions(data, filter);

    elements.push({
      data: { id: 'project', label: data.project.name, kind: 'project', size: 100, tooltip: `프로젝트 · ${data.project.name}` },
      position: positions['project'],
    });

    const categories = [
      { id: 'cat-wbs',      label: 'WBS',       kind: 'wbs-hub',     visible: filter.wbs,      route: 'wbs',        count: flattenWbs(data.wbs).length },
      { id: 'cat-changes',  label: '변경이력',   kind: 'change-hub',  visible: filter.changes,  route: 'changelogs', count: Math.min(data.changeLogs.length, 30) },
      { id: 'cat-meetings', label: '회의록',     kind: 'meeting-hub', visible: filter.meetings, route: 'meetings',   count: Math.min(data.meetings.length, 30) },
      { id: 'cat-dev',      label: '개발 정보',  kind: 'dev-hub',     visible: filter.dev,      route: 'devinfo',    count: Math.min(data.devInfo.length, 30) },
    ];

    for (const cat of categories) {
      if (!cat.visible) continue;
      elements.push({
        data: { id: cat.id, label: `${cat.label}\n(${cat.count})`, kind: cat.kind, size: 70, route: cat.route, tooltip: `카테고리 · ${cat.label} (${cat.count}건)` },
        position: positions[cat.id],
      });
      elements.push({ data: { id: `e-project-${cat.id}`, source: 'project', target: cat.id, kind: 'cat-edge' } });
    }

    if (filter.wbs) {
      for (const item of flattenWbs(data.wbs)) {
        const id = `wbs-${item.id}`;
        const date = item.endDate?.slice(0, 10) ?? '-';
        elements.push({
          data: {
            id,
            label: item.name + (item.isMilestone ? ' ◆' : ''),
            kind: item.isMilestone ? 'milestone' : 'wbs',
            size: item.isMilestone ? 42 : 34,
            tooltip: `${item.isMilestone ? '마일스톤' : 'WBS'} · ${item.name}\n상태: ${item.status} / 종료: ${date}\n담당: ${item.assignee || '-'}`,
          },
          position: positions[id],
        });
        const parent = item.parentId ? `wbs-${item.parentId}` : 'cat-wbs';
        elements.push({ data: { id: `e-${parent}-${id}`, source: parent, target: id, kind: 'wbs-edge' } });
      }
    }

    if (filter.changes) {
      for (const c of data.changeLogs.slice(0, 30)) {
        const id = `change-${c.id}`;
        const label = c.content.length > 24 ? c.content.slice(0, 24) + '…' : c.content;
        elements.push({
          data: { id, label, kind: 'change', impact: c.impact, size: 32, tooltip: `변경이력 · ${c.impact}\n${c.content}\n${c.date.slice(0, 10)}` },
          position: positions[id],
        });
        elements.push({ data: { id: `e-cat-changes-${id}`, source: 'cat-changes', target: id, kind: 'change-edge' } });
      }
    }

    if (filter.meetings) {
      for (const m of data.meetings.slice(0, 30)) {
        const id = `meeting-${m.id}`;
        const label = m.topic.length > 24 ? m.topic.slice(0, 24) + '…' : m.topic;
        elements.push({
          data: { id, label, kind: 'meeting', size: 32, tooltip: `회의록 · ${m.topic}\n${m.date.slice(0, 10)}` },
          position: positions[id],
        });
        elements.push({ data: { id: `e-cat-meetings-${id}`, source: 'cat-meetings', target: id, kind: 'meeting-edge' } });
      }
    }

    if (filter.dev) {
      for (const d of data.devInfo.slice(0, 30)) {
        const id = `dev-${d.id}`;
        const label = d.title.length > 24 ? d.title.slice(0, 24) + '…' : d.title;
        elements.push({
          data: { id, label, kind: 'dev', size: 32, tooltip: `개발 정보 · ${d.type}\n${d.title}` },
          position: positions[id],
        });
        elements.push({ data: { id: `e-cat-dev-${id}`, source: 'cat-dev', target: id, kind: 'dev-edge' } });
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
            'text-outline-color': '#0a0a0a',
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
        { selector: 'node[kind = "project"]',     style: { 'background-color': PALETTE.project.fill, 'border-color': PALETTE.project.stroke, color: PALETTE.project.text, 'font-size': '16px', 'font-weight': 800, 'border-width': 3, 'shadow-blur': 24, 'shadow-color': '#818cf8', 'shadow-opacity': 0.5 } as any },
        { selector: 'node[kind = "wbs-hub"]',     style: { 'background-color': PALETTE.wbsHub.fill,     'border-color': PALETTE.wbsHub.stroke,     color: PALETTE.wbsHub.text,     'font-weight': 700, 'border-width': 2.5 } as any },
        { selector: 'node[kind = "change-hub"]',  style: { 'background-color': PALETTE.changeHub.fill,  'border-color': PALETTE.changeHub.stroke,  color: PALETTE.changeHub.text,  'font-weight': 700, 'border-width': 2.5 } as any },
        { selector: 'node[kind = "meeting-hub"]', style: { 'background-color': PALETTE.meetingHub.fill, 'border-color': PALETTE.meetingHub.stroke, color: PALETTE.meetingHub.text, 'font-weight': 700, 'border-width': 2.5 } as any },
        { selector: 'node[kind = "dev-hub"]',     style: { 'background-color': PALETTE.devHub.fill,     'border-color': PALETTE.devHub.stroke,     color: PALETTE.devHub.text,     'font-weight': 700, 'border-width': 2.5 } as any },
        { selector: 'node[kind = "wbs"]',         style: { 'background-color': PALETTE.wbs.fill,         'border-color': PALETTE.wbs.stroke,         color: PALETTE.wbs.text } as any },
        { selector: 'node[kind = "milestone"]',   style: { 'background-color': PALETTE.milestone.fill,   'border-color': PALETTE.milestone.stroke,   color: PALETTE.milestone.text, shape: 'diamond' } as any },
        { selector: 'node[kind = "meeting"]',     style: { 'background-color': PALETTE.meeting.fill,     'border-color': PALETTE.meeting.stroke,     color: PALETTE.meeting.text } as any },
        { selector: 'node[kind = "dev"]',         style: { 'background-color': PALETTE.dev.fill,         'border-color': PALETTE.dev.stroke,         color: PALETTE.dev.text } as any },
        { selector: 'node[kind = "change"][impact = "Low"]',      style: { 'background-color': PALETTE.changeLow.fill,      'border-color': PALETTE.changeLow.stroke,      color: PALETTE.changeLow.text } as any },
        { selector: 'node[kind = "change"][impact = "Medium"]',   style: { 'background-color': PALETTE.changeMedium.fill,   'border-color': PALETTE.changeMedium.stroke,   color: PALETTE.changeMedium.text } as any },
        { selector: 'node[kind = "change"][impact = "High"]',     style: { 'background-color': PALETTE.changeHigh.fill,     'border-color': PALETTE.changeHigh.stroke,     color: PALETTE.changeHigh.text } as any },
        { selector: 'node[kind = "change"][impact = "Critical"]', style: { 'background-color': PALETTE.changeCritical.fill, 'border-color': PALETTE.changeCritical.stroke, color: PALETTE.changeCritical.text } as any },
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
        { selector: 'edge[kind = "cat-edge"]',     style: { width: 3, 'line-color': '#818cf8', opacity: 0.9 } as any },
        { selector: 'edge[kind = "wbs-edge"]',     style: { 'line-color': PALETTE.wbsHub.stroke,     opacity: 0.6 } as any },
        { selector: 'edge[kind = "change-edge"]',  style: { 'line-color': PALETTE.changeHub.stroke,  opacity: 0.6 } as any },
        { selector: 'edge[kind = "meeting-edge"]', style: { 'line-color': PALETTE.meetingHub.stroke, opacity: 0.6 } as any },
        { selector: 'edge[kind = "dev-edge"]',     style: { 'line-color': PALETTE.devHub.stroke,     opacity: 0.6 } as any },
      ],
      layout: { name: 'preset' } as any,
      wheelSensitivity: 0.2,
    });

    // Hover tooltip
    const tip = tooltipRef.current;
    cy.on('mouseover', 'node', (evt) => {
      const t = evt.target.data('tooltip');
      if (!t || !tip) return;
      tip.textContent = t;
      tip.style.display = 'block';
    });
    cy.on('mousemove', 'node', (evt) => {
      if (!tip) return;
      const orig = evt.originalEvent as MouseEvent;
      const rect = containerRef.current!.getBoundingClientRect();
      tip.style.left = `${orig.clientX - rect.left + 14}px`;
      tip.style.top = `${orig.clientY - rect.top + 14}px`;
    });
    cy.on('mouseout', 'node', () => {
      if (tip) tip.style.display = 'none';
    });

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const id: string = node.data('id');
      const route: string | undefined = node.data('route');
      if (route) navigate(`/projects/${pid}/${route}`);
      else if (id.startsWith('wbs-')) navigate(`/projects/${pid}/wbs`);
      else if (id.startsWith('change-')) navigate(`/projects/${pid}/changelogs`);
      else if (id.startsWith('meeting-')) navigate(`/projects/${pid}/meetings`);
      else if (id.startsWith('dev-')) navigate(`/projects/${pid}/devinfo`);
    });

    cy.fit(undefined, 60);
    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [data, filter, pid, navigate]);

  // Re-fit when filter changes (after re-render)
  useEffect(() => {
    const t = setTimeout(() => cyRef.current?.fit(undefined, 60), 60);
    return () => clearTimeout(t);
  }, [filter]);

  const legendItems = useMemo(() => [
    { key: 'wbs',      label: 'WBS',       color: PALETTE.wbsHub.stroke },
    { key: 'changes',  label: '변경이력',   color: PALETTE.changeHub.stroke },
    { key: 'meetings', label: '회의록',     color: PALETTE.meetingHub.stroke },
    { key: 'dev',      label: '개발 정보',  color: PALETTE.devHub.stroke },
  ], []);

  if (error) return <div className="p-6 text-sm text-red-400">{error}</div>;
  if (!data) return <div className="p-6 text-sm text-muted">로딩 중...</div>;

  const toggle = (k: keyof typeof filter) => setFilter((f) => ({ ...f, [k]: !f[k] }));
  const btnClass = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors border ${
      active
        ? 'bg-indigo-600 text-white border-indigo-500'
        : 'bg-surface-2 text-secondary border-default hover:bg-surface-3'
    }`;

  return (
    <div className="p-6 h-full flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-lg font-semibold text-primary flex items-center gap-2">
          <Network size={18} className="text-accent" />
          프로젝트 맵
        </h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => toggle('wbs')} className={btnClass(filter.wbs)}>
            <CalendarDays size={14} /> WBS
          </button>
          <button onClick={() => toggle('changes')} className={btnClass(filter.changes)}>
            <GitBranch size={14} /> 변경
          </button>
          <button onClick={() => toggle('meetings')} className={btnClass(filter.meetings)}>
            <FileText size={14} /> 회의
          </button>
          <button onClick={() => toggle('dev')} className={btnClass(filter.dev)}>
            <Code2 size={14} /> 개발
          </button>
          <button
            onClick={() => cyRef.current?.fit(undefined, 60)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-surface-2 text-secondary hover:bg-surface-3 border border-default"
          >
            <Maximize2 size={14} /> 화면 맞춤
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted">
        <span>범례</span>
        {legendItems.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: l.color }} />
            {l.label}
          </span>
        ))}
      </div>

      <div className="flex-1 relative bg-surface border border-default rounded-lg overflow-hidden min-h-0">
        <div
          ref={containerRef}
          className="w-full h-full"
          style={{
            minHeight: 500,
            backgroundImage: 'radial-gradient(circle at center, var(--bg-surface) 0%, var(--bg-base) 75%)',
          }}
        />
        <div
          ref={tooltipRef}
          className="absolute pointer-events-none z-10 px-2.5 py-1.5 rounded-md text-xs whitespace-pre bg-surface-2 border border-strong text-primary shadow-lg"
          style={{ display: 'none' }}
        />
      </div>

      <p className="text-xs text-muted">
        중앙: 프로젝트 / ↑ WBS / → 변경이력 / ↓ 회의록 / ← 개발 정보. 노드 클릭 → 해당 페이지로 이동, hover → 상세 표시.
      </p>
    </div>
  );
}
