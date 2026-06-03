import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import type { ThemeMode } from './store/settings';
import { Layout } from './components/Layout';
import { WidgetDashboard } from './pages/WidgetDashboard';
import { ProjectList } from './pages/ProjectList';
import { Dashboard } from './pages/Dashboard';
import { WbsPage } from './pages/WbsPage';
import { ChangeLogsPage } from './pages/ChangeLogsPage';
import { MeetingsPage } from './pages/MeetingsPage';
import { DevInfoPage } from './pages/DevInfoPage';
import { ProjectMapPage } from './pages/ProjectMapPage';
import { SettingsPage } from './pages/SettingsPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { WbsTemplatesPage } from './pages/WbsTemplatesPage';
import { MonitoringPage } from './pages/MonitoringPage';
import { IssuesPage } from './pages/IssuesPage';
import { WorkLogPage } from './pages/WorkLogPage';
import { ActivityPage } from './pages/ActivityPage';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsModal } from './components/ShortcutsModal';
import { GlobalProgressBar } from './components/GlobalProgressBar';
import { ConfirmDialogHost } from './components/ui/ConfirmDialog';
import { applyAppearance, loadSettings, seedDefaultAuthorIfEmpty } from './store/settings';
import i18n from './i18n';
import { isCustomDark } from './utils/themeCustom';
import { getMachineAccount } from './utils/hostBridge';
import { systemApi, EXPECTED_API_VERSION } from './api/system';

// 메인 앱 셸 — 사이드바 Layout + 전역 컴포넌트 + 시작 시 핑/업데이트 체크.
// 위젯(/widget)은 이 셸 밖에서 독립 렌더되므로 핑·업데이트 토스트·커맨드팔레트가 뜨지 않는다.
function MainShell() {
  const [theme, setTheme] = useState<ThemeMode>(() => loadSettings().theme);

  useEffect(() => {
    const s = loadSettings();
    applyAppearance(s);

    // SettingsPage 가 외관 변경 시 'atlas:settings-changed' 발화 — 테마·로고색·문서제목 재적용 + Toaster theme 동기화 (P7-1)
    const onSettings = () => {
      const next = loadSettings();
      applyAppearance(next);
      setTheme(next.theme);
      // 언어 라이브 전환 — useTranslation 구독 컴포넌트가 즉시 재렌더된다.
      if (i18n.language !== next.language) i18n.changeLanguage(next.language);
    };
    window.addEventListener('atlas:settings-changed', onSettings);

    // 작성자 자동 추적의 시작점: defaultAuthor 가 비어 있으면 클라 머신 계정으로 한 번 시드.
    // 이후 모든 API 요청의 X-Atlas-Actor 헤더로 이 값이 자동 전송된다.
    if (s.defaultAuthor === '') {
      getMachineAccount().then((name) => {
        if (name) seedDefaultAuthorIfEmpty(name);
      });
    }

    // 시작 시 백엔드 ping — apiVersion 불일치 시 경고, 연결 실패 시 에러.
    systemApi.ping().then((r) => {
      if (r.apiVersion !== EXPECTED_API_VERSION) {
        toast.warning(
          i18n.t('toast.backendVersionMismatch', { server: r.apiVersion, front: EXPECTED_API_VERSION }),
          { duration: 8000 },
        );
      }
    }).catch(() => {
      toast.error(i18n.t('toast.backendUnreachable'), { duration: 8000 });
    });

    // 백그라운드 업데이트 체크가 새 버전을 발견해 뒀으면 시작 시 안내 (silent — 실패해도 무시).
    systemApi.getUpdateStatus().then((s) => {
      if (s.lastResult?.hasUpdate) {
        toast.info(i18n.t('toast.updateAvailable', { version: s.lastResult.latestVersion }), { duration: 8000 });
      }
    }).catch(() => {});

    return () => window.removeEventListener('atlas:settings-changed', onSettings);
  }, []);

  return (
    <>
      <Toaster
        position="top-right"
        theme={theme === 'custom' ? (isCustomDark(loadSettings().customColors) ? 'dark' : 'light') : theme}
        richColors
        closeButton
        duration={4000}
      />
      <GlobalProgressBar />
      <ConfirmDialogHost />
      <CommandPalette />
      <ShortcutsModal />
      <Layout>
        <Outlet />
      </Layout>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 위젯 모드: 사이드바·전역 토스트 없는 독립 셸 (별도 WebView2 창에서 로드) */}
        <Route path="/widget" element={<WidgetDashboard />} />
        <Route element={<MainShell />}>
          <Route path="/" element={<ProjectList />} />
          <Route path="/monitoring" element={<MonitoringPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/wbs-templates" element={<WbsTemplatesPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/projects/:projectId/dashboard" element={<Dashboard />} />
          <Route path="/projects/:projectId/wbs" element={<WbsPage />} />
          <Route path="/projects/:projectId/worklog" element={<WorkLogPage />} />
          <Route path="/projects/:projectId/issues" element={<IssuesPage />} />
          <Route path="/projects/:projectId/changelogs" element={<ChangeLogsPage />} />
          <Route path="/projects/:projectId/meetings" element={<MeetingsPage />} />
          <Route path="/projects/:projectId/devinfo" element={<DevInfoPage />} />
          <Route path="/projects/:projectId/map" element={<ProjectMapPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
