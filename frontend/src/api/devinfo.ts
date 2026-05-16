import { api } from './client';
import type { DevInfoItem } from '../types';

export const devInfoApi = {
  getByProject: (projectId: number) =>
    api.get<DevInfoItem[]>(`/projects/${projectId}/devinfo`),
  create: (data: Omit<DevInfoItem, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.post<DevInfoItem>(`/projects/${data.projectId}/devinfo`, data),
  update: (projectId: number, id: number, data: Partial<DevInfoItem>) =>
    api.put<DevInfoItem>(`/projects/${projectId}/devinfo/${id}`, data),
  delete: (projectId: number, id: number) =>
    api.delete(`/projects/${projectId}/devinfo/${id}`),
  openFile: (projectId: number, id: number) =>
    api.post<void>(`/projects/${projectId}/devinfo/${id}/open`, {}),
  getDistinctTags: (projectId: number) =>
    api.get<string[]>(`/projects/${projectId}/devinfo/tags`),
};
