import { api } from './client';
import type { ChangeLog } from '../types';

// 역방향 카운트 — Issue/WBS 행 배지용.
export interface ChangeLogSourceCounts {
  byIssueId: Record<number, number>;
  byWbsItemId: Record<number, number>;
}

export const changeLogsApi = {
  getByProject: (projectId: number) =>
    api.get<ChangeLog[]>(`/projects/${projectId}/changelogs`),
  getSourceCounts: (projectId: number) =>
    api.get<ChangeLogSourceCounts>(`/projects/${projectId}/changelogs/source-counts`),
  create: (data: Omit<ChangeLog, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>) =>
    api.post<ChangeLog>(`/projects/${data.projectId}/changelogs`, data),
  update: (projectId: number, id: number, data: Partial<ChangeLog>) =>
    api.put<ChangeLog>(`/projects/${projectId}/changelogs/${id}`, data),
  delete: (projectId: number, id: number) =>
    api.delete(`/projects/${projectId}/changelogs/${id}`),
};
