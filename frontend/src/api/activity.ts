import { api } from './client';
import type { ActivityLog } from '../types';

export const activityApi = {
  getByProject: (projectId: number, limit = 20) =>
    api.get<ActivityLog[]>(`/projects/${projectId}/activity?limit=${limit}`),
};
