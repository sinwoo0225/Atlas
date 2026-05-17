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

export const systemApi = {
  // silent — 시작 시 1회 호출이라 progress bar / 자동 toast 제외 (mismatch / 실패는 App.tsx 가 별도 처리).
  ping: () => api.get<SystemPing>('/system/ping', { silent: true }),
  getDataFolder: () => api.get<DataFolderInfo>('/system/data-folder'),
  previewDataFolder: (path: string) =>
    api.post<DataFolderPreview>('/system/data-folder/preview', { path }),
  setDataFolder: (path: string) =>
    api.put<DataFolderSetResult>('/system/data-folder', { path }),
};
