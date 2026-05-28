import { api } from './client';
import type {
  ActivityByProject, AgingWipItem, CalendarEvent, CategoryCount, ForecastBundle, KanbanColumn, KanbanItem,
  MonitoringCharts, MonitoringData, MonitoringRisk, MonitoringTrends, OpenIssuesByProject,
  ResourceHeatmap, StaleProject, WeeklyReview, WorkloadOverview,
} from '../types';

export const monitoringApi = {
  getToday: () => api.get<MonitoringData>('/monitoring/today'),
  getCharts: () => api.get<MonitoringCharts>('/monitoring/charts'),
  getResourceHeatmap: () => api.get<ResourceHeatmap>('/monitoring/resource-heatmap'),
  // Phase 1 인사이트 — 개요 Risk Radar / 방치 프로젝트 / 담당자 워크로드 / Aging WIP.
  getRisk: () => api.get<MonitoringRisk>('/monitoring/risk'),
  getStale: (days = 14) => api.get<StaleProject[]>(`/monitoring/stale?days=${days}`),
  getWorkload: () => api.get<WorkloadOverview>('/monitoring/workload'),
  getAgingWip: () => api.get<AgingWipItem[]>('/monitoring/aging-wip'),
  getCategoryBreakdown: () => api.get<CategoryCount[]>('/monitoring/category-breakdown'),
  // Phase 2 추세 번들 — 추세/담당자 탭 지연 로드.
  getTrends: (weeks = 12, activityDays = 30) =>
    api.get<MonitoringTrends>(`/monitoring/trends?weeks=${weeks}&activityDays=${activityDays}`),
  // Phase 3 예측·고급 번들 — 추세 탭 '실험' 섹션 지연 로드.
  getForecast: (weeks = 12) => api.get<ForecastBundle>(`/monitoring/forecast?weeks=${weeks}`),
  // 프로젝트별 활동량 위젯 — 최근 N일(기본 30) top 20.
  getActivityByProject: (days = 30) =>
    api.get<ActivityByProject[]>(`/monitoring/activity-by-project?days=${days}`),
  // 주간 업무일지 통합 첨부용 — 프로젝트별 미해결 이슈 스냅샷.
  openIssues: () => api.get<OpenIssuesByProject[]>('/monitoring/issues/open'),
  // 주간 회고 다이제스트 — 완료한 항목 / 놓친 마감 / 다음 주 예정. 누락 시 이번 주(월요일).
  getWeeklyReview: (weekStart?: string) =>
    api.get<WeeklyReview>(`/monitoring/weekly-review${weekStart ? `?weekStart=${weekStart}` : ''}`),
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
