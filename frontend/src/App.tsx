import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { applyTheme, loadSettings } from './store/settings';

export default function App() {
  useEffect(() => {
    applyTheme(loadSettings().theme);
  }, []);

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<ProjectList />} />
          <Route path="/monitoring" element={<MonitoringPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
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
