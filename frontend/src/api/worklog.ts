import { api } from './client';
import type { WorkLog, UpsertWorkLog, WeeklyWorkLog } from '../types';

export const worklogApi = {
  getWeek: (projectId: number, weekStart: string) =>
    api.get<WorkLog[]>(`/projects/${projectId}/worklogs?weekStart=${weekStart}`),
  upsert: (projectId: number, date: string, body: UpsertWorkLog) =>
    api.put<WorkLog>(`/projects/${projectId}/worklogs/${date}`, body),
  // 진행 항목 자동 작성 — 진행(InProgress) WBS·이슈를 해당 날짜 '한 일'에 [시작]으로 일괄 추가. 갱신된 주 일지 반환.
  autoProgress: (projectId: number, date: string) =>
    api.post<{ wbs: number; issues: number; week: WorkLog[] }>(`/projects/${projectId}/worklogs/${date}/auto-progress`, {}),
  weeklyMonitoring: (weekStart: string, mode?: 'byDay' | 'finalState') =>
    api.get<WeeklyWorkLog>(`/monitoring/worklogs/weekly?weekStart=${weekStart}${mode === 'finalState' ? '&mode=finalState' : ''}`),
};
