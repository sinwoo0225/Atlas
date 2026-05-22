import { api } from './client';
import type {
  ActivityByProject, CalendarEvent, KanbanColumn, KanbanItem,
  MonitoringCharts, MonitoringData, OpenIssuesByProject, ResourceHeatmap,
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
  // 마감 캘린더 — from/to (yyyy-MM-dd, 양끝 포함) 범위의 WBS·이슈 마감 이벤트.
  getCalendar: (from: string, to: string) =>
    api.get<CalendarEvent[]>(`/monitoring/calendar?from=${from}&to=${to}`),
  // 칸반 — 미완 전부 + 완료(doneSince 이후, 누락 시 14일).
  getKanban: (doneSince?: string) =>
    api.get<KanbanItem[]>(`/monitoring/kanban${doneSince ? `?doneSince=${doneSince}` : ''}`),
  // 칸반 드래그 — 카드를 컬럼으로 이동(상태 변경).
  moveKanban: (kind: 'wbs' | 'issue', id: number, column: KanbanColumn) =>
    api.post<void>('/monitoring/kanban/move', { kind, id, column }),
};
