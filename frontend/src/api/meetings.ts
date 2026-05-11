import { api } from './client';
import type { Meeting } from '../types';

export const meetingsApi = {
  getByProject: (projectId: number, keyword?: string) =>
    api.get<Meeting[]>(`/projects/${projectId}/meetings${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''}`),
  create: (data: Omit<Meeting, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.post<Meeting>(`/projects/${data.projectId}/meetings`, data),
  update: (projectId: number, id: number, data: Partial<Meeting>) =>
    api.put<Meeting>(`/projects/${projectId}/meetings/${id}`, data),
  delete: (projectId: number, id: number) =>
    api.delete(`/projects/${projectId}/meetings/${id}`),
};
