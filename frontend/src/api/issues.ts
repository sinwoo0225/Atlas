import { api } from './client';
import type { Issue } from '../types';

export const issuesApi = {
  getByProject: (projectId: number) =>
    api.get<Issue[]>(`/projects/${projectId}/issues`),
  create: (data: Omit<Issue, 'id' | 'createdAt' | 'updatedAt' | 'assigneeName'>) =>
    api.post<Issue>(`/projects/${data.projectId}/issues`, data),
  update: (projectId: number, id: number, data: Partial<Issue>) =>
    api.put<Issue>(`/projects/${projectId}/issues/${id}`, data),
  delete: (projectId: number, id: number) =>
    api.delete(`/projects/${projectId}/issues/${id}`),
};
