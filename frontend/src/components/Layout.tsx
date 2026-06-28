import { useEffect, useState, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  Check,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutGrid,
  ChevronsRight,
  ChevronsLeft,
} from 'lucide-react';
import { useProjectStore } from '../store/useProjectStore';
import { NotificationBell } from './notifications/NotificationBell';
import { loadSettings, patchSettings } from '../store/settings';
import { isHostBridgeAvailable, toggleWidget } from '../utils/hostBridge';
import { MenuIcon } from '../utils/iconRegistry';
import { useRecentTracker } from '../hooks/useRecentTracker';
import { useGlobalShortcut } from '../hooks/useGlobalShortcut';
import { useActiveProjectId } from '../hooks/useActiveProjectId';

// path = iconRegistry 의 메뉴 슬롯키. 아이콘은 getMenuIcon(slot) 으로 조회(커스터마이즈 가능).
// key = nav 네임스페이스의 i18n 키. 라벨은 렌더 시점에 t('nav:'+key) 로 해석.
// 전역 메뉴는 빈도/성격별 3개 섹션으로 그룹화 — 헤더 라벨은 t('nav:group.'+groupKey).
const navGroups = [
  { groupKey: 'main', items: [
    { path: '/', key: 'projects' },
    { path: '/todos', key: 'todos' },
  ] },
  { groupKey: 'insights', items: [
    { path: '/monitoring', key: 'monitoring' },
    { path: '/retrospective', key: 'retrospective' },
    { path: '/activity', key: 'activity' },
  ] },
  { groupKey: 'manage', items: [
    { path: '/resources', key: 'resources' },
    { path: '/wbs-templates', key: 'wbsTemplates' },
  ] },
];

const projectNavItems = [
  { path: 'dashboard', key: 'dashboard' },
  { path: 'wbs', key: 'wbs' },
  { path: 'worklog', key: 'worklog' },
  { path: 'issues', key: 'issues' },
  { path: 'meetings', key: 'meetings' },
  { path: 'changelogs', key: 'changelogs' },
  { path: 'devinfo', key: 'devinfo' },
  { path: 'map', key: 'map' },
];

// 사이드바의 검색 트리거. 실제 검색 UI 는 CommandPalette (App 최상위 mount) — 이 버튼은
// Ctrl+K 단축키와 동일하게 팔레트를 연다. 클릭 시 keydown 이벤트를 직접 dispatch.
function SearchTrigger() {
  const { t } = useTranslation();
  const handleClick = () => {
    // useGlobalShortcut 가 keydown 으로 토글하므로 같은 이벤트를 합성해 보낸다.
    const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true });
    window.dispatchEvent(ev);
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      title={t('nav:searchTitle')}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-surface-2 hover:bg-surface-3 border border-default text-sm text-muted hover:text-secondary"
    >
      <Search size={14} />
      <span className="flex-1 text-left">{t('search')}</span>
      <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-default bg-surface-3 text-muted">Ctrl K</kbd>
    </button>
  );
}

function ProjectSwitcher() {
  const { t } = useTranslation();
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
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-muted">{t('currentProject')}</span>
          <span className="truncate text-secondary font-medium">{current?.name ?? t('selectProject')}</span>
        </div>
        <ChevronDown size={14} className={`text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="absolute z-30 top-full left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-surface border border-default rounded-md shadow-lg">
          {projects.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t('noProjects')}</li>}
          {projects.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => handlePick(p.id)}
                className="w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-surface-2"
              >
                <span className={`min-w-0 truncate ${p.id === selectedId ? 'text-accent font-medium' : 'text-secondary'}`}>
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
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedProjectId, selectProject, projects } = useProjectStore();
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const [collapsed, setCollapsed] = useState(() => loadSettings().sidebarCollapsed);
  useRecentTracker();

  // 워드마크 텍스트 + 메뉴 아이콘 오버라이드 — 설정 저장 시(atlas:settings-changed) 즉시 반영.
  const [brand, setBrand] = useState(() => {
    const s = loadSettings();
    return { primary: s.brandPrimaryText, accent: s.brandAccentText, menuIcons: s.menuIcons };
  });
  useEffect(() => {
    const onChange = () => {
      const s = loadSettings();
      setBrand({ primary: s.brandPrimaryText, accent: s.brandAccentText, menuIcons: s.menuIcons });
    };
    window.addEventListener('atlas:settings-changed', onChange);
    return () => window.removeEventListener('atlas:settings-changed', onChange);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      patchSettings({ sidebarCollapsed: next });
      return next;
    });
  };
  useGlobalShortcut('mod+b', toggleCollapsed);

  // G+X 시퀀스 — 페이지 이동. projectId 가 필요한 페이지는 URL → store → lastProjectId 순으로 fallback
  // (useActiveProjectId — 명령 팔레트와 공유). pid 없으면 silent 무시 (네비게이션 단축키가 toast 띄우면 거슬림).
  const resolveProjectId = useActiveProjectId();
  useGlobalShortcut('g d', () => { const pid = resolveProjectId(); if (pid) navigate(`/projects/${pid}/dashboard`); });
  useGlobalShortcut('g i', () => { const pid = resolveProjectId(); if (pid) navigate(`/projects/${pid}/issues`); });
  useGlobalShortcut('g w', () => { const pid = resolveProjectId(); if (pid) navigate(`/projects/${pid}/wbs`); });
  useGlobalShortcut('g m', () => { const pid = resolveProjectId(); if (pid) navigate(`/projects/${pid}/meetings`); });
  useGlobalShortcut('g c', () => { const pid = resolveProjectId(); if (pid) navigate(`/projects/${pid}/changelogs`); });
  useGlobalShortcut('g v', () => { const pid = resolveProjectId(); if (pid) navigate(`/projects/${pid}/devinfo`); });
  useGlobalShortcut('g r', () => navigate('/resources'));
  useGlobalShortcut('g s', () => navigate('/settings'));

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

  // 프로젝트 작업 중(펼침+프로젝트 선택)에는 3행 레이아웃 — 2행이 좌(전역 아이콘 레일)+우(프로젝트 라벨 메인).
  const dualPane = !collapsed && !!selectedProject;

  // 통합(전역) 메뉴 펼침 — 명시적 확장 버튼으로 토글하는 모달 드로어(호버 아님, 미영속).
  const [integratedExpanded, setIntegratedExpanded] = useState(false);
  const expandBtnRef = useRef<HTMLButtonElement | null>(null);
  const closeIntegrated = () => {
    setIntegratedExpanded(false);
    // 닫힐 때 트리거(확장 버튼)로 포커스 복귀 — 키보드 맥락 유지.
    requestAnimationFrame(() => expandBtnRef.current?.focus());
  };
  // 드로어가 열려 있을 때 Esc 로 닫기.
  useEffect(() => {
    if (!integratedExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIntegratedExpanded(false);
        requestAnimationFrame(() => expandBtnRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [integratedExpanded]);
  // dual 상태를 벗어나면(접힘/프로젝트 해제) 드로어 상태 초기화.
  useEffect(() => { if (!dualPane) setIntegratedExpanded(false); }, [dualPane]);

  const linkClass = (active: boolean, iconOnly: boolean) =>
    `flex items-center gap-2 ${iconOnly ? 'px-2 justify-center' : 'px-3'} py-2 rounded-lg text-sm transition-colors border-l-2 ${
      active
        ? 'bg-accent-soft text-accent font-medium border-accent'
        : 'text-secondary hover:bg-surface-2 border-transparent'
    }`;

  // ---- 공유 렌더 헬퍼 (접힘/무프로젝트/2단 3상태가 같은 링크 마크업을 재사용) ----
  const renderGlobalGroups = (iconOnly: boolean) =>
    navGroups.map((group, gi) => (
      <div key={group.groupKey} className="space-y-1">
        {!iconOnly ? (
          <div className={gi === 0 ? 'pb-1' : 'pt-3 pb-1'}>
            <p className="text-[10px] text-muted px-3 font-medium uppercase tracking-wider">
              {t('nav:group.' + group.groupKey)}
            </p>
          </div>
        ) : (
          gi > 0 && <div className="border-t border-default mt-2 mb-1" />
        )}
        {group.items.map(({ path, key }) => {
          const active = location.pathname === path;
          const label = t('nav:' + key);
          return (
            <Link
              key={path}
              to={path}
              className={linkClass(active, iconOnly)}
              aria-current={active ? 'page' : undefined}
              title={iconOnly ? label : undefined}
              aria-label={iconOnly ? label : undefined}
            >
              <MenuIcon slot={path} overrides={brand.menuIcons} size={16} />
              {!iconOnly && label}
            </Link>
          );
        })}
      </div>
    ));

  const renderProjectMenu = (iconOnly: boolean) =>
    projectNavItems.map(({ path, key }) => {
      const fullPath = `/projects/${selectedProjectId}/${path}`;
      const active = location.pathname === fullPath;
      const label = t('nav:' + key);
      return (
        <Link
          key={path}
          to={fullPath}
          className={linkClass(active, iconOnly)}
          aria-current={active ? 'page' : undefined}
          title={iconOnly ? label : undefined}
          aria-label={iconOnly ? label : undefined}
        >
          <MenuIcon slot={path} overrides={brand.menuIcons} size={16} />
          {!iconOnly && label}
        </Link>
      );
    });

  const renderBottom = (iconOnly: boolean) => (
    <>
      {(() => {
        const bridge = isHostBridgeAvailable();
        return (
          <button
            type="button"
            onClick={() => toggleWidget()}
            disabled={!bridge}
            title={bridge ? t('nav:widgetToggleTitle') : t('nav:widgetDesktopOnly')}
            aria-label={t('nav:widgetToggle')}
            className={`${linkClass(false, iconOnly)} w-full disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <LayoutGrid size={16} />
            {!iconOnly && t('nav:widget')}
          </button>
        );
      })()}
      {(() => {
        const active = location.pathname === '/settings';
        return (
          <Link
            to="/settings"
            className={linkClass(active, iconOnly)}
            aria-current={active ? 'page' : undefined}
            title={iconOnly ? t('nav:settings') : undefined}
            aria-label={iconOnly ? t('nav:settings') : undefined}
          >
            <MenuIcon slot="settings" overrides={brand.menuIcons} size={16} />
            {!iconOnly && t('nav:settings')}
          </Link>
        );
      })()}
    </>
  );

  const logoMark = (
    <h1 className="text-xl leading-none tracking-tight">
      <span className="logo-primary">{brand.primary.slice(0, 1) || 'A'}</span>
      <span className="logo-accent">{brand.accent.slice(0, 1) || 't'}</span>
    </h1>
  );
  const logoFull = (
    <div className="min-w-0">
      <h1 className="text-2xl leading-none tracking-tight">
        <span className="logo-primary">{brand.primary}</span><span className="logo-accent">{brand.accent}</span>
      </h1>
      <p className="text-[11px] text-muted mt-1 tracking-wide">The map of your projects</p>
    </div>
  );
  const collapseBtn = (
    <button
      type="button"
      onClick={toggleCollapsed}
      title={`${t(collapsed ? 'nav:sidebarExpand' : 'nav:sidebarCollapse')} (Ctrl+B)`}
      aria-label={t(collapsed ? 'nav:sidebarExpand' : 'nav:sidebarCollapse')}
      className="p-1 text-muted hover:text-primary transition-colors shrink-0"
    >
      {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
    </button>
  );
  const searchIconBtn = (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
      title={t('nav:searchTitle')}
      aria-label={t('search')}
      className={`${linkClass(false, true)} w-full`}
    >
      <Search size={16} />
    </button>
  );
  // 알림 종 — 검색 아이콘 위에 배치. 레일용(아이콘 풀폭) / 헤더용(컴팩트) 2가지 스타일.
  const railBell = <NotificationBell className={`${linkClass(false, true)} w-full`} />;
  const headerBell = <NotificationBell className="p-1 text-muted hover:text-primary transition-colors shrink-0" />;

  // ---- 상태 ①접힘 / ②펼침-무프로젝트: 단일 컬럼 (기존 동작 유지) ----
  const singleColumn = (
    <aside className={`${collapsed ? 'w-14' : 'w-60'} bg-sidebar sidebar-edge border-r border-default flex flex-col shrink-0 transition-all`}>
      {/* collapsed (56px) 에서는 로고/버튼 세로 스택 — 가로 justify-between 으로는 w-full 로고가 버튼을 밀어냄. */}
      <div className={`py-4 border-b border-default ${collapsed ? 'px-2 flex flex-col items-center gap-2' : 'px-4 flex items-center justify-between gap-2'}`}>
        {collapsed ? logoMark : logoFull}
        {collapsed ? (
          <>
            {railBell}
            {collapseBtn}
          </>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            {headerBell}
            {collapseBtn}
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="px-3 pt-3">
          <SearchTrigger />
        </div>
      )}

      <nav className="flex-1 px-2 pt-3 pb-3 space-y-1 overflow-y-auto">
        {renderGlobalGroups(collapsed)}

        {/* 프로젝트 선택 드롭다운 — 펼침 상태에서만(무프로젝트일 때 프로젝트 고르기). */}
        {!collapsed && (
          <div className="px-1 pt-3">
            <ProjectSwitcher />
          </div>
        )}

        {/* 접힘 + 프로젝트 선택: 프로젝트 메뉴를 아이콘으로. (펼침+프로젝트는 dualPane 분기로 빠짐) */}
        {collapsed && selectedProject && (
          <>
            <div className="border-t border-default mt-3 mb-1" />
            {renderProjectMenu(true)}
          </>
        )}
      </nav>

      <div className={`${collapsed ? 'p-2' : 'p-3'} border-t border-default space-y-1`}>
        {renderBottom(collapsed)}
      </div>
    </aside>
  );

  // ---- 상태 ③ 펼침 + 프로젝트 선택: 3행(브랜드 / 2열 / 하단) + 통합 메뉴 모달 드로어 ----
  // 1·3행은 전폭, 2행만 좌(전역 아이콘 레일)+우(프로젝트 메인). 확장 버튼으로 통합 메뉴가
  // 프로젝트 위로 펼쳐지고(드로어), 우측 peek 는 scrim 음영으로 하위 계층임을 표시.
  const dualPaneSidebar = (
    <aside className="w-[248px] shrink-0 h-screen bg-sidebar sidebar-edge border-r border-default flex flex-col">
      {/* 1행 — 브랜드 + 열림/닫힘 (전폭) */}
      <div className="py-4 px-4 border-b border-default flex items-center justify-between gap-2">
        {logoFull}
        {collapseBtn}
      </div>

      {/* 2행 — 좌 전역 아이콘 레일 / 우 프로젝트 메뉴(메인). 통합 펼침 시 드로어+scrim 오버레이. */}
      <div className="relative flex-1 flex min-h-0">
        {/* 좌: 통합 레일 (아이콘). relative — 우측 경계 확장 핸들의 기준. */}
        <div className="relative w-14 shrink-0 border-r border-default flex flex-col">
          <div className="px-2 pt-3 pb-1 space-y-1">{railBell}{searchIconBtn}</div>
          <nav className="flex-1 px-2 pt-1 pb-3 space-y-1 overflow-y-auto">
            {renderGlobalGroups(true)}
          </nav>
          {/* 확장 핸들 — 레일↔프로젝트 분할선 우측 경계·세로 중앙. ▶=오른쪽으로 펼침. */}
          {!integratedExpanded && (
            <button
              ref={expandBtnRef}
              type="button"
              onClick={() => setIntegratedExpanded(true)}
              aria-expanded={integratedExpanded}
              title={t('nav:railExpand')}
              aria-label={t('nav:railExpand')}
              className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 z-20 h-7 w-5 rounded-full bg-surface border border-default shadow-sm flex items-center justify-center text-muted hover:text-primary hover:bg-surface-2 transition-colors"
            >
              <ChevronsRight size={13} />
            </button>
          )}
        </div>

        {/* 우: 프로젝트 패널 (메인) */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="px-3 py-3 border-b border-default">
            <ProjectSwitcher />
          </div>
          <nav className="flex-1 px-2 pt-3 pb-3 space-y-1 overflow-y-auto">
            {renderProjectMenu(false)}
          </nav>
        </div>

        {/* 통합 메뉴 모달 드로어 — 확장 버튼으로 열림. 프로젝트 영역을 덮고 우측 peek 는 scrim 음영. */}
        {integratedExpanded && (
          <>
            <div
              className="modal-fade-in absolute inset-y-0 right-0 left-14 z-30 bg-black/40"
              onClick={closeIntegrated}
              aria-hidden="true"
            />
            <div className="sidebar-drawer-in absolute inset-y-0 left-0 w-48 z-40 bg-sidebar sidebar-edge border-r border-default shadow-xl flex flex-col">
              <div className="px-3 pt-3 pb-1">
                <SearchTrigger />
              </div>
              <nav
                className="flex-1 px-2 pt-2 pb-3 space-y-1 overflow-y-auto"
                onClick={(e) => { if ((e.target as HTMLElement).closest('a')) closeIntegrated(); }}
              >
                {renderGlobalGroups(false)}
              </nav>
              {/* 축소 핸들 — 드로어 우측 경계·세로 중앙. ◀=접기. 드로어와 함께 슬라이드(분할선을 탐). */}
              <button
                type="button"
                onClick={closeIntegrated}
                title={t('nav:railCollapse')}
                aria-label={t('nav:railCollapse')}
                className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 z-50 h-7 w-5 rounded-full bg-surface border border-default shadow-sm flex items-center justify-center text-muted hover:text-primary hover:bg-surface-2 transition-colors"
              >
                <ChevronsLeft size={13} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* 3행 — 위젯 / 설정 (전폭) */}
      <div className="p-3 border-t border-default space-y-1">
        {renderBottom(false)}
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-base text-primary">
      {dualPane ? dualPaneSidebar : singleColumn}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
