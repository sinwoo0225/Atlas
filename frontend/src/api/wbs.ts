import { api } from './client';
import type { WbsItem, WbsVersion } from '../types';

export const wbsApi = {
  getByProject: (projectId: number, versionId?: number) =>
    api.get<WbsItem[]>(`/projects/${projectId}/wbs${versionId ? `?versionId=${versionId}` : ''}`),
  create: (data: Omit<WbsItem, 'id' | 'createdAt' | 'updatedAt' | 'children'>) =>
    api.post<WbsItem>(`/projects/${data.projectId}/wbs`, data),
  update: (projectId: number, id: number, data: Partial<WbsItem>) =>
    api.put<WbsItem>(`/projects/${projectId}/wbs/${id}`, data),
  delete: (projectId: number, id: number) =>
    api.delete(`/projects/${projectId}/wbs/${id}`),
  getVersions: (projectId: number) =>
    api.get<WbsVersion[]>(`/projects/${projectId}/wbs-versions`),
  createVersion: (data: { projectId: number; versionName: string; description: string }) =>
    api.post<WbsVersion>(`/projects/${data.projectId}/wbs-versions`, data),
  setCurrentVersion: (projectId: number, versionId: number) =>
    api.put<void>(`/projects/${projectId}/wbs-versions/${versionId}/set-current`, {}),
};
