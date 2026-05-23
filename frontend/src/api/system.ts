import { api } from './client';

// 프론트가 기대하는 백엔드 apiVersion. 백엔드 SystemController.Ping 의 apiVersion 이 이 값과 다르면
// App.tsx 가 mismatch 경고 toast 를 띄운다. breaking change 시 양쪽 모두 +1.
export const EXPECTED_API_VERSION = 1;

export interface SystemPing {
  ok: boolean;
  server: string;
  apiVersion: number;
  version: string;
}

export interface DataFolderInfo {
  current: string;
  defaultPath: string;
  configFilePath: string;
}

export interface DataFolderPreview {
  exists: boolean;
  isWritable: boolean;
  hasExistingDb: boolean;
  projectCount: number | null;
  warnings: string[];
}

export interface DataFolderSetResult {
  saved: string;
  requiresRestart: boolean;
}

export interface BackupConfig {
  enabled: boolean;
  folder: string | null;
  intervalHours: number;
  retention: number;
  includeFiles: boolean;
}

export interface BackupStatus {
  folder: string | null;
  lastBackupAt: string | null;
  count: number;
}

export interface BackupRunResult {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

export interface UpdateConfig {
  enabled: boolean;
  intervalHours: number;
  lastCheckedAt: string | null;
  latestKnownVersion: string | null;
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseNotes: string | null;
  downloadUrl: string | null;
  assetName: string | null;
  sizeBytes: number;
  publishedAt: string | null;
}

export interface UpdateStatus {
  phase: 'idle' | 'checking' | 'downloading' | 'ready' | 'error';
  percent: number;
  downloadedPath: string | null;
  error: string | null;
  lastResult: UpdateCheckResult | null;
  runningMcp: number;
  runningCli: number;
}

export const systemApi = {
  // silent — 시작 시 1회 호출이라 progress bar / 자동 toast 제외 (mismatch / 실패는 App.tsx 가 별도 처리).
  ping: () => api.get<SystemPing>('/system/ping', { silent: true }),
  getDataFolder: () => api.get<DataFolderInfo>('/system/data-folder'),
  previewDataFolder: (path: string) =>
    api.post<DataFolderPreview>('/system/data-folder/preview', { path }),
  setDataFolder: (path: string) =>
    api.put<DataFolderSetResult>('/system/data-folder', { path }),
  getBackupConfig: () => api.get<BackupConfig>('/system/backup/config'),
  setBackupConfig: (c: BackupConfig) => api.put<{ saved: boolean }>('/system/backup/config', c),
  runBackup: () => api.post<BackupRunResult>('/system/backup/run', {}),
  getBackupStatus: () => api.get<BackupStatus>('/system/backup/status'),
  getUpdateConfig: () => api.get<UpdateConfig>('/system/update/config'),
  setUpdateConfig: (enabled: boolean, intervalHours: number) =>
    api.put<{ saved: boolean }>('/system/update/config', { enabled, intervalHours }),
  checkUpdate: () => api.post<UpdateCheckResult>('/system/update/check', {}),
  getUpdateStatus: () => api.get<UpdateStatus>('/system/update/status', { silent: true }),
  startUpdateDownload: () => api.post<UpdateStatus>('/system/update/download', {}),
  launchUpdate: () => api.post<{ launched: boolean }>('/system/update/launch', {}),
  revealUpdate: () => api.post<{ revealed: boolean }>('/system/update/reveal', {}),
};
