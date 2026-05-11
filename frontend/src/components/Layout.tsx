import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
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
  { path: 'issues', label: '이슈 관리', Icon: AlertTriangle },
  { path: 'changelogs', label: '변경 이력', Icon: GitBranch },
  { path: 'meetings', label: '회의록', Icon: FileText },
  { path: 'devinfo', label: '개발 정보', Icon: Code2 },
  { path: 'map', label: '프로젝트 맵', Icon: Network },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { selectedProjectId, selectProject, projects } = useProjectStore();
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // 마지막 선택 프로젝트 자동 선택
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

  // 선택된 프로젝트 ID 저장
  useEffect(() => {
    if (selectedProjectId !== null) {
      patchSettings({ lastProjectId: selectedProjectId });
    }
  }, [selectedProjectId]);

  const linkClass = (active: boolean) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
      active
        ? 'bg-zinc-700 text-white'
        : 'text-slate-300 hover:bg-zinc-800'
    }`;

  return (
    <div className="flex h-screen bg-[#141414] text-slate-200">
      <aside className="w-56 bg-[#1c1c1c] border-r border-[#2a2a2a] flex flex-col shrink-0">
        <div className="p-4 border-b border-[#2a2a2a]">
          <h1 className="text-base font-semibold text-slate-100">SW 프로젝트 관리</h1>
          <p className="text-xs text-slate-500 mt-0.5">개인용 프로젝트 관리</p>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(({ path, label, Icon }) => (
            <Link key={path} to={path} className={linkClass(location.pathname === path)}>
              <Icon size={16} />
              {label}
            </Link>
          ))}

          {selectedProject && (
            <>
              <div className="pt-3 pb-1">
                <p className="text-xs text-slate-500 px-3 font-medium uppercase tracking-wider">
                  현재 프로젝트
                </p>
                <p className="text-xs text-slate-300 px-3 mt-1 truncate">{selectedProject.name}</p>
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

        <div className="p-3 border-t border-[#2a2a2a]">
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
