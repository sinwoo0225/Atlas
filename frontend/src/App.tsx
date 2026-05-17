import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import type { ThemeMode } from './store/settings';
import { Layout } from './components/Layout';
import { ProjectList } from './pages/ProjectList';
import { Dashboard } from './pages/Dashboard';
import { WbsPage } from './pages/WbsPage';
import { ChangeLogsPage } from './pages/ChangeLogsPage';
import { MeetingsPage } from './pages/MeetingsPage';
import { DevInfoPage } from './pages/DevInfoPage';
import { ProjectMapPage } from './pages/ProjectMapPage';
import { SettingsPage } from './pages/SettingsPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { MonitoringPage } from './pages/MonitoringPage';
import { IssuesPage } from './pages/IssuesPage';
import { WorkLogPage } from './pages/WorkLogPage';
import { ActivityPage } from './pages/ActivityPage';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsModal } from './components/ShortcutsModal';
import { GlobalProgressBar } from './components/GlobalProgressBar';
import { ConfirmDialogHost } from './components/ui/ConfirmDialog';
import { applyTheme, applyMarkdownStyle, loadSettings, seedDefaultAuthorIfEmpty } from './store/settings';
import { getMachineAccount } from './utils/hostBridge';
import { systemApi, EXPECTED_API_VERSION } from './api/system';

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => loadSettings().theme);

  useEffect(() => {
    const s = loadSettings();
    applyTheme(s.theme);
    applyMarkdownStyle(s.markdownFontSize, s.markdownLineHeight);

    // SettingsPage 가 theme 변경 시 'atlas:settings-changed' 발화 — Toaster theme 동기화 (P7-1)
    const onSettings = () => setTheme(loadSettings().theme);
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
          `Atlas 백엔드 버전이 프론트와 일치하지 않아요 (서버 ${r.apiVersion} / 프론트 ${EXPECTED_API_VERSION}). 새로고침 또는 재시작이 필요할 수 있어요.`,
          { duration: 8000 },
        );
      }
    }).catch(() => {
      toast.error('Atlas 백엔드에 연결할 수 없어요. 백엔드가 실행 중인지 확인해 주세요.', { duration: 8000 });
    });

    return () => window.removeEventListener('atlas:settings-changed', onSettings);
  }, []);

  return (
    <BrowserRouter>
      <Toaster position="top-right" theme={theme} richColors closeButton duration={4000} />
      <GlobalProgressBar />
      <ConfirmDialogHost />
      <CommandPalette />
      <ShortcutsModal />
      <Layout>
        <Routes>
          <Route path="/" element={<ProjectList />} />
          <Route path="/monitoring" element={<MonitoringPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
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
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
