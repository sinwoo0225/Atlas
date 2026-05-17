import { api, type RequestOptions } from './client';
import type { Meeting, Issue, WbsItem } from '../types';

export const meetingsApi = {
  getByProject: (projectId: number, keyword?: string) =>
    api.get<Meeting[]>(`/projects/${projectId}/meetings${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''}`),
  get: (projectId: number, id: number) =>
    api.get<Meeting>(`/projects/${projectId}/meetings/${id}`),
  create: (data: Omit<Meeting, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.post<Meeting>(`/projects/${data.projectId}/meetings`, data),
  update: (projectId: number, id: number, data: Partial<Meeting>, opts?: RequestOptions) =>
    api.put<Meeting>(`/projects/${projectId}/meetings/${id}`, data, opts),
  delete: (projectId: number, id: number) =>
    api.delete(`/projects/${projectId}/meetings/${id}`),
  promoteToIssue: (projectId: number, meetingId: number, actionItemId: string) =>
    api.post<Issue>(`/projects/${projectId}/meetings/${meetingId}/action-items/${encodeURIComponent(actionItemId)}/promote-to-issue`, {}),
  promoteToWbs: (projectId: number, meetingId: number, actionItemId: string) =>
    api.post<WbsItem>(`/projects/${projectId}/meetings/${meetingId}/action-items/${encodeURIComponent(actionItemId)}/promote-to-wbs`, {}),
};
