import { useEffect, useState, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  FolderOpen,
  LayoutDashboard,
  CalendarDays,
  GitBranch,
  FileText,
  Code2,
  Network,
  Settings,
  Activity,
  Users,
  AlertTriangle,
  ChevronDown,
  Check,
  NotebookPen,
  Search,
} from 'lucide-react';
import { useProjectStore } from '../store/useProjectStore';
import { loadSettings, patchSettings } from '../store/settings';

const navItems = [
  { path: '/', label: '프로젝트 목록', Icon: FolderOpen },
  { path: '/monitoring', label: '통합 모니터링', Icon: Activity },
  { path: '/resources', label: '리소스 관리', Icon: Users },
];

const projectNavItems = [
  { path: 'dashboard', label: '대시보드', Icon: LayoutDashboard },
  { path: 'wbs', label: '일정/WBS', Icon: CalendarDays },
  { path: 'worklog', label: '업무일지', Icon: NotebookPen },
  { path: 'issues', label: '이슈 관리', Icon: AlertTriangle },
  { path: 'changelogs', label: '변경이력', Icon: GitBranch },
  { path: 'meetings', label: '회의록', Icon: FileText },
  { path: 'devinfo', label: '개발 정보', Icon: Code2 },
  { path: 'map', label: '프로젝트 맵', Icon: Network },
];

// 사이드바의 검색 트리거. 실제 검색 UI 는 CommandPalette (App 최상위 mount) — 이 버튼은
// Ctrl+K 단축키와 동일하게 팔레트를 연다. 클릭 시 keydown 이벤트를 직접 dispatch.
function SearchTrigger() {
  const handleClick = () => {
    // useGlobalShortcut 가 keydown 으로 토글하므로 같은 이벤트를 합성해 보낸다.
    const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true });
    window.dispatchEvent(ev);
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      title="검색 (Ctrl+K)"
      className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-surface-2 hover:bg-surface-3 border border-default text-sm text-muted hover:text-secondary"
    >
      <Search size={14} />
      <span className="flex-1 text-left">검색</span>
      <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-default bg-surface-3 text-muted">Ctrl K</kbd>
    </button>
  );
}

function ProjectSwitcher() {
  const projects = useProjectStore((s) => s.projects);
  const selectedId = useProjectStore((s) => s.selectedProjectId);
  const selectProject = useProjectStore((s) => s.selectProject);
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const current = projects.find((p) => p.id === selectedId);
  const subMatch = location.pathname.match(/^\/projects\/\d+\/(.+)$/);

  const handlePick = (id: number) => {
    selectProject(id);
    if (subMatch) navigate(`/projects/${id}/${subMatch[1]}`);
    else navigate(`/projects/${id}/dashboard`);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-surface-2 hover:bg-surface-3 border border-default text-sm"
      >
        <div className="flex flex-col items-start min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-muted">현재 프로젝트</span>
          <span className="truncate text-secondary font-medium">{current?.name ?? '프로젝트 선택'}</span>
        </div>
        <ChevronDown size={14} className={`text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="absolute z-30 top-full left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-surface border border-default rounded-md shadow-lg">
          {projects.length === 0 && <li className="px-3 py-2 text-sm text-muted">프로젝트 없음</li>}
          {projects.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => handlePick(p.id)}
                className="w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-surface-2"
              >
                <span className={`truncate ${p.id === selectedId ? 'text-accent font-medium' : 'text-secondary'}`}>
                  {p.name}
                </span>
                {p.id === selectedId && <Check size={14} className="text-accent shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { selectedProjectId, selectProject, projects } = useProjectStore();
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  useEffect(() => {
    if (selectedProjectId !== null) return;
    if (projects.length === 0) return;
    const settings = loadSettings();
    if (!settings.autoSelectLastProject) return;
    const last = settings.lastProjectId;
    if (last && projects.some((p) => p.id === last)) {
      selectProject(last);
    }
  }, [projects, selectedProjectId, selectProject]);

  useEffect(() => {
    if (selectedProjectId !== null) {
      patchSettings({ lastProjectId: selectedProjectId });
    }
  }, [selectedProjectId]);

  const linkClass = (active: boolean) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border-l-2 ${
      active
        ? 'bg-accent-soft text-accent font-medium border-accent'
        : 'text-secondary hover:bg-surface-2 border-transparent'
    }`;

  return (
    <div className="flex h-screen bg-base text-primary">
      <aside className="w-60 bg-sidebar border-r border-default flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-default">
          <h1 className="text-2xl leading-none tracking-tight">
            <span className="logo-primary">At</span><span className="logo-accent">las</span>
          </h1>
          <p className="text-[11px] text-muted mt-1 tracking-wide">The map of your projects</p>
        </div>

        <div className="px-3 pt-3">
          <SearchTrigger />
        </div>

        <div className="px-3 pt-2">
          <ProjectSwitcher />
        </div>

        <nav className="flex-1 px-3 pt-3 pb-3 space-y-1 overflow-y-auto">
          {navItems.map(({ path, label, Icon }) => (
            <Link key={path} to={path} className={linkClass(location.pathname === path)}>
              <Icon size={16} />
              {label}
            </Link>
          ))}

          {selectedProject && (
            <>
              <div className="pt-3 pb-1">
                <p className="text-[10px] text-muted px-3 font-medium uppercase tracking-wider">
                  프로젝트 메뉴
                </p>
              </div>
              {projectNavItems.map(({ path, label, Icon }) => {
                const fullPath = `/projects/${selectedProjectId}/${path}`;
                return (
                  <Link key={path} to={fullPath} className={linkClass(location.pathname === fullPath)}>
                    <Icon size={16} />
                    {label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="p-3 border-t border-default">
          <Link to="/settings" className={linkClass(location.pathname === '/settings')}>
            <Settings size={16} />
            설정
          </Link>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
