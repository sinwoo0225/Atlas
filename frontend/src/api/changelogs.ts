import { api } from './client';
import type { ChangeLog } from '../types';

export const changeLogsApi = {
  getByProject: (projectId: number) =>
    api.get<ChangeLog[]>(`/projects/${projectId}/changelogs`),
  create: (data: Omit<ChangeLog, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>) =>
    api.post<ChangeLog>(`/projects/${data.projectId}/changelogs`, data),
  update: (projectId: number, id: number, data: Partial<ChangeLog>) =>
    api.put<ChangeLog>(`/projects/${projectId}/changelogs/${id}`, data),
  delete: (projectId: number, id: number) =>
    api.delete(`/projects/${projectId}/changelogs/${id}`),
};
