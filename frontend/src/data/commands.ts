import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, ListTree, AlertCircle, NotebookPen, GitBranch, Code2, CalendarDays, Network,
  LayoutGrid, Activity, Users, LayoutTemplate, History, Settings, Plus, PanelLeft, Keyboard,
} from 'lucide-react';
import type { NavigateFunction } from 'react-router-dom';
import { openShortcutsModal } from './shortcuts';

// 명령 팔레트(Ctrl+K)의 명령 모드 — 이동/생성/토글·도움말. 검색(엔티티 텍스트)과 별개.
// run 은 팔레트가 만든 컨텍스트(navigate · 활성 projectId · close)를 받아 동작한다.

export interface CommandContext {
  navigate: NavigateFunction;
  projectId: number | null;
  close: () => void;
}

export interface Command {
  id: string;
  // 표시 라벨은 t('palette:cmd.'+id) 로 해석. group 은 palette:group.* 키.
  groupKey: string;
  keywords?: string; // 매칭 보조(영문/별칭)
  icon: LucideIcon;
  available?: (ctx: CommandContext) => boolean;
  run: (ctx: CommandContext) => void;
}

const hasProject = (ctx: CommandContext) => ctx.projectId !== null;

// 사이드바 토글 — Layout 의 useGlobalShortcut('mod+b') 와 동일 동작을 합성 keydown 으로 재사용.
function dispatchCtrlB() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));
}

const GROUP_NAV = 'palette:group.navigate';
const GROUP_CREATE = 'palette:group.create';
const GROUP_TOGGLE = 'palette:group.toggle';
const GROUP_HELP = 'palette:group.help';

export const COMMANDS: Command[] = [
  // ===== 이동 (프로젝트) — 활성 프로젝트가 있을 때만 =====
  { id: 'go-dashboard', groupKey: GROUP_NAV, keywords: 'dashboard', icon: LayoutDashboard,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/dashboard`) },
  { id: 'go-wbs', groupKey: GROUP_NAV, keywords: 'wbs schedule gantt', icon: ListTree,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/wbs`) },
  { id: 'go-issues', groupKey: GROUP_NAV, keywords: 'issues', icon: AlertCircle,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/issues`) },
  { id: 'go-meetings', groupKey: GROUP_NAV, keywords: 'meetings', icon: NotebookPen,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/meetings`) },
  { id: 'go-changelogs', groupKey: GROUP_NAV, keywords: 'changelog', icon: GitBranch,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/changelogs`) },
  { id: 'go-devinfo', groupKey: GROUP_NAV, keywords: 'devinfo', icon: Code2,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/devinfo`) },
  { id: 'go-worklog', groupKey: GROUP_NAV, keywords: 'worklog', icon: CalendarDays,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/worklog`) },
  { id: 'go-map', groupKey: GROUP_NAV, keywords: 'map graph', icon: Network,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/map`) },

  // ===== 이동 (전역) =====
  { id: 'go-projects', groupKey: GROUP_NAV, keywords: 'projects home', icon: LayoutGrid,
    run: (c) => c.navigate('/') },
  { id: 'go-monitoring', groupKey: GROUP_NAV, keywords: 'monitoring dashboard', icon: Activity,
    run: (c) => c.navigate('/monitoring') },
  { id: 'go-resources', groupKey: GROUP_NAV, keywords: 'resources people', icon: Users,
    run: (c) => c.navigate('/resources') },
  { id: 'go-templates', groupKey: GROUP_NAV, keywords: 'templates', icon: LayoutTemplate,
    run: (c) => c.navigate('/wbs-templates') },
  { id: 'go-activity', groupKey: GROUP_NAV, keywords: 'activity feed log', icon: History,
    run: (c) => c.navigate('/activity') },
  { id: 'go-settings', groupKey: GROUP_NAV, keywords: 'settings', icon: Settings,
    run: (c) => c.navigate('/settings') },

  // ===== 생성 — 대상 페이지로 이동하며 ?new=1 부여(useCreateForm 이 폼을 연다) =====
  { id: 'new-issue', groupKey: GROUP_CREATE, keywords: 'new issue create', icon: Plus,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/issues?new=1`) },
  { id: 'new-wbs', groupKey: GROUP_CREATE, keywords: 'new wbs create', icon: Plus,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/wbs?new=1`) },
  { id: 'new-meeting', groupKey: GROUP_CREATE, keywords: 'new meeting create', icon: Plus,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/meetings?new=1`) },
  { id: 'new-changelog', groupKey: GROUP_CREATE, keywords: 'new changelog create', icon: Plus,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/changelogs?new=1`) },
  { id: 'new-devinfo', groupKey: GROUP_CREATE, keywords: 'new devinfo create', icon: Plus,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/devinfo?new=1`) },
  { id: 'new-resource', groupKey: GROUP_CREATE, keywords: 'new resource create', icon: Plus,
    run: (c) => c.navigate('/resources?new=1') },
  { id: 'new-project', groupKey: GROUP_CREATE, keywords: 'new project create', icon: Plus,
    run: (c) => c.navigate('/?new=1') },

  // ===== 토글 · 도움말 =====
  { id: 'toggle-sidebar', groupKey: GROUP_TOGGLE, keywords: 'sidebar toggle', icon: PanelLeft,
    run: () => dispatchCtrlB() },
  { id: 'open-shortcuts', groupKey: GROUP_HELP, keywords: 'shortcuts help keyboard', icon: Keyboard,
    run: () => openShortcutsModal() },
];

// 사용 가능한 명령 + 검색어(접두사 '>' 제거된 텍스트) 필터. 라벨·group 은 t 로 해석해 매칭하고
// keywords(영문 별칭)도 함께 부분일치(대소문자 무시). 라벨 키는 'palette:cmd.'+id.
export function filterCommands(filter: string, ctx: CommandContext, t: (key: string) => string): Command[] {
  const available = COMMANDS.filter((c) => !c.available || c.available(ctx));
  const q = filter.trim().toLowerCase();
  if (q === '') return available;
  return available.filter((c) =>
    t('palette:cmd.' + c.id).toLowerCase().includes(q)
    || t(c.groupKey).toLowerCase().includes(q)
    || (c.keywords?.toLowerCase().includes(q) ?? false));
}
