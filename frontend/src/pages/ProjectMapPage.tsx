import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import cytoscape from 'cytoscape';
// @ts-expect-error - cytoscape-dagre has no types
import dagre from 'cytoscape-dagre';
import type { Core, ElementDefinition } from 'cytoscape';
import { Network, CalendarDays, GitBranch, FileText, Code2 } from 'lucide-react';
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

/**
 * 4방향(상·우·하·좌)으로 허브 노드를 배치하고 그 하위 노드들을 해당 방향으로 펼치는
 * 수동(preset) 위치 계산.
 */
function buildPositions(data: LoadedData, filter: { wbs: boolean; changes: boolean; meetings: boolean; dev: boolean }) {
  const cx = 0; // 중앙 X
  const cy = 0; // 중앙 Y

  const HUB_DIST = 260;
  const NODE_SPACING = 80;
  const COLUMN_OFFSET = 160; // 허브를 기준으로 자식이 어디로 펼쳐지는지

  const positions: Record<string, { x: number; y: number }> = {
    project: { x: cx, y: cy },
    'cat-wbs': { x: cx, y: cy - HUB_DIST }, // 위
    'cat-changes': { x: cx + HUB_DIST, y: cy }, // 우
    'cat-meetings': { x: cx, y: cy + HUB_DIST }, // 아래
    'cat-dev': { x: cx - HUB_DIST, y: cy }, // 좌
  };

  // WBS (위쪽 방향으로 펼침)
  if (filter.wbs) {
    const flat = flattenWbs(data.wbs);
    flat.forEach((item, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      positions[`wbs-${item.id}`] = {
        x: cx + (col - 1) * COLUMN_OFFSET,
        y: cy - HUB_DIST - (row + 1) * NODE_SPACING - 40,
      };
    });
  }

  // 변경 이력 (우측 방향으로 펼침)
  if (filter.changes) {
    data.changeLogs.slice(0, 30).forEach((c, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      positions[`change-${c.id}`] = {
        x: cx + HUB_DIST + (col + 1) * COLUMN_OFFSET + 30,
        y: cy + (row - 4) * NODE_SPACING * 0.8,
      };
    });
  }

  // 회의록 (아래쪽 방향으로 펼침)
  if (filter.meetings) {
    data.meetings.slice(0, 30).forEach((m, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      positions[`meeting-${m.id}`] = {
        x: cx + (col - 1) * COLUMN_OFFSET,
        y: cy + HUB_DIST + (row + 1) * NODE_SPACING + 40,
      };
    });
  }

  // 개발 정보 (좌측 방향으로 펼침)
  if (filter.dev) {
    data.devInfo.slice(0, 30).forEach((d, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      positions[`dev-${d.id}`] = {
        x: cx - HUB_DIST - (col + 1) * COLUMN_OFFSET - 30,
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
  const cyRef = useRef<Core | null>(null);
  const [data, setData] = useState<LoadedData | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<{ wbs: boolean; changes: boolean; meetings: boolean; dev: boolean }>({
    wbs: true, changes: true, meetings: true, dev: true,
  });

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
      data: { id: 'project', label: data.project.name, kind: 'project', size: 90 },
      position: positions['project'],
    });

    const categories: { id: string; label: string; kind: string; visible: boolean; route: string }[] = [
      { id: 'cat-wbs', label: 'WBS', kind: 'wbs-hub', visible: filter.wbs, route: 'wbs' },
      { id: 'cat-changes', label: '변경 이력', kind: 'change-hub', visible: filter.changes, route: 'changelogs' },
      { id: 'cat-meetings', label: '회의록', kind: 'meeting-hub', visible: filter.meetings, route: 'meetings' },
      { id: 'cat-dev', label: '개발 정보', kind: 'dev-hub', visible: filter.dev, route: 'devinfo' },
    ];

    for (const cat of categories) {
      if (!cat.visible) continue;
      elements.push({
        data: { id: cat.id, label: cat.label, kind: cat.kind, size: 60, route: cat.route },
        position: positions[cat.id],
      });
      elements.push({ data: { id: `e-project-${cat.id}`, source: 'project', target: cat.id, kind: 'cat-edge' } });
    }

    if (filter.wbs) {
      const flat = flattenWbs(data.wbs);
      for (const item of flat) {
        const id = `wbs-${item.id}`;
        elements.push({
          data: {
            id,
            label: item.name + (item.isMilestone ? ' ◆' : ''),
            kind: item.isMilestone ? 'milestone' : 'wbs',
            size: item.isMilestone ? 38 : 30,
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
          data: { id, label, kind: 'change', impact: c.impact, size: 28 },
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
          data: { id, label, kind: 'meeting', size: 28 },
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
          data: { id, label, kind: 'dev', devType: d.type, size: 28 },
          position: positions[id],
        });
        elements.push({ data: { id: `e-cat-dev-${id}`, source: 'cat-dev', target: id, kind: 'dev-edge' } });
      }
    }

    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

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
            color: '#e5e7eb',
            'font-size': '11px',
            'font-family': 'Pretendard, Inter, Segoe UI, sans-serif',
            'font-weight': 500,
            'text-wrap': 'wrap',
            'text-max-width': '110px',
            'text-outline-color': '#0f0f0f',
            'text-outline-width': 1,
            width: 'data(size)',
            height: 'data(size)',
            'background-color': '#3a3a3a',
            'border-color': '#5a5a5a',
            'border-width': 1.5,
            shape: 'round-rectangle',
            'corner-radius': '8' as any,
            'background-opacity': 0.95,
            'shadow-blur': 8,
            'shadow-color': '#000',
            'shadow-opacity': 0.4,
            'shadow-offset-x': 0,
            'shadow-offset-y': 2,
          } as any,
        },
        // 프로젝트 (중앙)
        { selector: 'node[kind = "project"]', style: { 'background-color': '#525252', 'border-color': '#a3a3a3', color: '#fff', 'font-size': '14px', 'font-weight': 700, shape: 'round-rectangle' } as any },
        // 허브 노드들
        { selector: 'node[kind = "wbs-hub"]', style: { 'background-color': '#404040', 'border-color': '#9ca3af', color: '#f3f4f6', 'font-weight': 600 } as any },
        { selector: 'node[kind = "change-hub"]', style: { 'background-color': '#404040', 'border-color': '#fb923c', color: '#fed7aa', 'font-weight': 600 } as any },
        { selector: 'node[kind = "meeting-hub"]', style: { 'background-color': '#404040', 'border-color': '#86efac', color: '#bbf7d0', 'font-weight': 600 } as any },
        { selector: 'node[kind = "dev-hub"]', style: { 'background-color': '#404040', 'border-color': '#7dd3fc', color: '#e0f2fe', 'font-weight': 600 } as any },
        // WBS 항목
        { selector: 'node[kind = "wbs"]', style: { 'background-color': '#3f3f46', 'border-color': '#a1a1aa' } as any },
        { selector: 'node[kind = "milestone"]', style: { 'background-color': '#52525b', 'border-color': '#d4d4d8', shape: 'diamond' } as any },
        // 변경 이력 - 영향도별
        { selector: 'node[kind = "change"][impact = "Critical"]', style: { 'background-color': '#7f1d1d', 'border-color': '#ef4444' } as any },
        { selector: 'node[kind = "change"][impact = "High"]', style: { 'background-color': '#7c2d12', 'border-color': '#f97316' } as any },
        { selector: 'node[kind = "change"][impact = "Medium"]', style: { 'background-color': '#713f12', 'border-color': '#eab308' } as any },
        { selector: 'node[kind = "change"][impact = "Low"]', style: { 'background-color': '#14532d', 'border-color': '#22c55e' } as any },
        // 회의록
        { selector: 'node[kind = "meeting"]', style: { 'background-color': '#14532d', 'border-color': '#4ade80' } as any },
        // 개발 정보
        { selector: 'node[kind = "dev"]', style: { 'background-color': '#1e3a5f', 'border-color': '#60a5fa' } as any },
        {
          selector: 'edge',
          style: {
            width: 1,
            'line-color': '#3a3a3a',
            'curve-style': 'unbundled-bezier',
            'control-point-distances': [20],
            'control-point-weights': [0.5],
            opacity: 0.7,
          } as any,
        },
        { selector: 'edge[kind = "cat-edge"]', style: { width: 2.5, 'line-color': '#6b7280', opacity: 0.9 } as any },
        { selector: 'edge[kind = "wbs-edge"]', style: { 'line-color': '#71717a' } as any },
        { selector: 'edge[kind = "change-edge"]', style: { 'line-color': '#92400e' } as any },
        { selector: 'edge[kind = "meeting-edge"]', style: { 'line-color': '#166534' } as any },
        { selector: 'edge[kind = "dev-edge"]', style: { 'line-color': '#1e40af' } as any },
      ],
      layout: { name: 'preset' } as any,
      wheelSensitivity: 0.2,
    });

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const id: string = node.data('id');
      const route: string | undefined = node.data('route');
      if (route) {
        navigate(`/projects/${pid}/${route}`);
      } else if (id.startsWith('wbs-')) {
        navigate(`/projects/${pid}/wbs`);
      } else if (id.startsWith('change-')) {
        navigate(`/projects/${pid}/changelogs`);
      } else if (id.startsWith('meeting-')) {
        navigate(`/projects/${pid}/meetings`);
      } else if (id.startsWith('dev-')) {
        navigate(`/projects/${pid}/devinfo`);
      }
    });

    cy.fit(undefined, 60);

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [data, filter, pid, navigate]);

  if (error) return <div className="p-6 text-sm text-red-400">{error}</div>;
  if (!data) return <div className="p-6 text-sm text-slate-400">로딩 중...</div>;

  const toggle = (k: keyof typeof filter) => setFilter((f) => ({ ...f, [k]: !f[k] }));
  const btnClass = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
      active ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-slate-300 hover:bg-zinc-700'
    }`;

  return (
    <div className="p-6 h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <Network size={18} className="text-slate-400" />
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
            className="px-3 py-1.5 rounded-md text-sm bg-zinc-800 text-slate-300 hover:bg-zinc-700 transition-colors"
          >
            화면 맞춤
          </button>
        </div>
      </div>

      <div className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden min-h-0">
        <div ref={containerRef} className="w-full h-full" style={{ minHeight: 500 }} />
      </div>

      <p className="text-xs text-slate-500">
        중앙: 프로젝트 / 위: WBS / 우: 변경 이력 / 아래: 회의록 / 좌: 개발 정보. 노드를 클릭하면 해당 페이지로 이동합니다.
      </p>
    </div>
  );
}
