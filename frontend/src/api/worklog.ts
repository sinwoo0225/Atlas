import { api } from './client';
import type { WorkLog, UpsertWorkLog, WeeklyWorkLog } from '../types';

export const worklogApi = {
  getWeek: (projectId: number, weekStart: string) =>
    api.get<WorkLog[]>(`/projects/${projectId}/worklogs?weekStart=${weekStart}`),
  upsert: (projectId: number, date: string, body: UpsertWorkLog) =>
    api.put<WorkLog>(`/projects/${projectId}/worklogs/${date}`, body),
  weeklyMonitoring: (weekStart: string) =>
    api.get<WeeklyWorkLog>(`/monitoring/worklogs/weekly?weekStart=${weekStart}`),
};
