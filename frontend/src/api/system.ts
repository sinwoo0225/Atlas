import { api } from './client';

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
  getDataFolder: () => api.get<DataFolderInfo>('/system/data-folder'),
  previewDataFolder: (path: string) =>
    api.post<DataFolderPreview>('/system/data-folder/preview', { path }),
  setDataFolder: (path: string) =>
    api.put<DataFolderSetResult>('/system/data-folder', { path }),
};
