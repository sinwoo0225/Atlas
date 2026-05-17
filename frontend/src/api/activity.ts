import { api } from './client';
import type { ActivityAction, ActivityEntityType, ActivityLog } from '../types';

// 전역 활동 피드 필터 (ActivityPage 사용). 모두 optional — 미지정 시 미적용.
export interface ActivityListFilter {
  projectId?: number | null;
  entityTypes?: ActivityEntityType[];
  actions?: ActivityAction[];
  from?: string | null;  // 'yyyy-MM-dd'
  to?: string | null;    // 'yyyy-MM-dd'
  limit?: number;
  offset?: number;
}

function buildQuery(f: ActivityListFilter): string {
  const params = new URLSearchParams();
  if (f.projectId != null) params.set('projectId', String(f.projectId));
  if (f.entityTypes?.length) params.set('entityType', f.entityTypes.join(','));
  if (f.actions?.length) params.set('action', f.actions.join(','));
  if (f.from) params.set('from', f.from);
  if (f.to) params.set('to', f.to);
  params.set('limit', String(f.limit ?? 100));
  params.set('offset', String(f.offset ?? 0));
  return params.toString();
}

export const activityApi = {
  getByProject: (projectId: number, limit = 20) =>
    api.get<ActivityLog[]>(`/projects/${projectId}/activity?limit=${limit}`),
  // 전역 활동 피드 — /activity 페이지가 호출. limit 은 서버에서 1~200 으로 clamp.
  getAll: (filter: ActivityListFilter = {}) =>
    api.get<ActivityLog[]>(`/activity?${buildQuery(filter)}`),
};
