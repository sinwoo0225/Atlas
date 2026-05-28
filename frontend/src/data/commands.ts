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
  label: string;
  group: string;
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

export const COMMANDS: Command[] = [
  // ===== 이동 (프로젝트) — 활성 프로젝트가 있을 때만 =====
  { id: 'go-dashboard', group: '이동', label: '대시보드로 이동', keywords: 'dashboard', icon: LayoutDashboard,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/dashboard`) },
  { id: 'go-wbs', group: '이동', label: '일정/WBS로 이동', keywords: 'wbs schedule gantt', icon: ListTree,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/wbs`) },
  { id: 'go-issues', group: '이동', label: '이슈로 이동', keywords: 'issues', icon: AlertCircle,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/issues`) },
  { id: 'go-meetings', group: '이동', label: '회의록으로 이동', keywords: 'meetings', icon: NotebookPen,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/meetings`) },
  { id: 'go-changelogs', group: '이동', label: '변경이력으로 이동', keywords: 'changelog', icon: GitBranch,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/changelogs`) },
  { id: 'go-devinfo', group: '이동', label: '개발정보로 이동', keywords: 'devinfo', icon: Code2,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/devinfo`) },
  { id: 'go-worklog', group: '이동', label: '업무일지로 이동', keywords: 'worklog', icon: CalendarDays,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/worklog`) },
  { id: 'go-map', group: '이동', label: '프로젝트 맵으로 이동', keywords: 'map graph', icon: Network,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/map`) },

  // ===== 이동 (전역) =====
  { id: 'go-projects', group: '이동', label: '프로젝트 목록으로 이동', keywords: 'projects home', icon: LayoutGrid,
    run: (c) => c.navigate('/') },
  { id: 'go-monitoring', group: '이동', label: '통합 모니터링으로 이동', keywords: 'monitoring dashboard', icon: Activity,
    run: (c) => c.navigate('/monitoring') },
  { id: 'go-resources', group: '이동', label: '리소스로 이동', keywords: 'resources people', icon: Users,
    run: (c) => c.navigate('/resources') },
  { id: 'go-templates', group: '이동', label: 'WBS 템플릿으로 이동', keywords: 'templates', icon: LayoutTemplate,
    run: (c) => c.navigate('/wbs-templates') },
  { id: 'go-activity', group: '이동', label: '활동 피드로 이동', keywords: 'activity feed log', icon: History,
    run: (c) => c.navigate('/activity') },
  { id: 'go-settings', group: '이동', label: '설정으로 이동', keywords: 'settings', icon: Settings,
    run: (c) => c.navigate('/settings') },

  // ===== 생성 — 대상 페이지로 이동하며 ?new=1 부여(useCreateForm 이 폼을 연다) =====
  { id: 'new-issue', group: '생성', label: '신규 이슈', keywords: 'new issue create', icon: Plus,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/issues?new=1`) },
  { id: 'new-wbs', group: '생성', label: '신규 WBS', keywords: 'new wbs create', icon: Plus,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/wbs?new=1`) },
  { id: 'new-meeting', group: '생성', label: '신규 회의록', keywords: 'new meeting create', icon: Plus,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/meetings?new=1`) },
  { id: 'new-changelog', group: '생성', label: '신규 변경이력', keywords: 'new changelog create', icon: Plus,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/changelogs?new=1`) },
  { id: 'new-devinfo', group: '생성', label: '신규 개발정보', keywords: 'new devinfo create', icon: Plus,
    available: hasProject, run: (c) => c.navigate(`/projects/${c.projectId}/devinfo?new=1`) },
  { id: 'new-resource', group: '생성', label: '신규 리소스', keywords: 'new resource create', icon: Plus,
    run: (c) => c.navigate('/resources?new=1') },
  { id: 'new-project', group: '생성', label: '신규 프로젝트', keywords: 'new project create', icon: Plus,
    run: (c) => c.navigate('/?new=1') },

  // ===== 토글 · 도움말 =====
  { id: 'toggle-sidebar', group: '토글', label: '사이드바 접기/펼치기', keywords: 'sidebar toggle', icon: PanelLeft,
    run: () => dispatchCtrlB() },
  { id: 'open-shortcuts', group: '도움말', label: '단축키 도움말 열기', keywords: 'shortcuts help keyboard', icon: Keyboard,
    run: () => openShortcutsModal() },
];

// 사용 가능한 명령 + 검색어(접두사 '>' 제거된 텍스트) 필터. label·keywords·group 부분일치(대소문자 무시).
export function filterCommands(filter: string, ctx: CommandContext): Command[] {
  const available = COMMANDS.filter((c) => !c.available || c.available(ctx));
  const q = filter.trim().toLowerCase();
  if (q === '') return available;
  return available.filter((c) =>
    c.label.toLowerCase().includes(q)
    || c.group.toLowerCase().includes(q)
    || (c.keywords?.toLowerCase().includes(q) ?? false));
}
