import { api } from './client';
import type { ActivityLog } from '../types';

export const activityApi = {
  getByProject: (projectId: number, limit = 20) =>
    api.get<ActivityLog[]>(`/projects/${projectId}/activity?limit=${limit}`),
  // 전역 활동 피드 — /activity 페이지가 호출. limit 은 서버에서 1~200 으로 clamp.
  getAll: (limit = 100, offset = 0) =>
    api.get<ActivityLog[]>(`/activity?limit=${limit}&offset=${offset}`),
};
