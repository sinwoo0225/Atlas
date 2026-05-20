import { api } from './client';
import type {
  ActivityByProject, MonitoringCharts, MonitoringData, OpenIssuesByProject, ResourceHeatmap,
} from '../types';

export const monitoringApi = {
  getToday: () => api.get<MonitoringData>('/monitoring/today'),
  getCharts: () => api.get<MonitoringCharts>('/monitoring/charts'),
  getResourceHeatmap: () => api.get<ResourceHeatmap>('/monitoring/resource-heatmap'),
  // 프로젝트별 활동량 위젯 — 최근 N일(기본 30) top 20.
  getActivityByProject: (days = 30) =>
    api.get<ActivityByProject[]>(`/monitoring/activity-by-project?days=${days}`),
  // 주간 업무일지 통합 첨부용 — 프로젝트별 미해결 이슈 스냅샷.
  openIssues: () => api.get<OpenIssuesByProject[]>('/monitoring/issues/open'),
};
