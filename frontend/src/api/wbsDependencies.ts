import { api } from './client';
import type { CriticalPath, RescheduleResult, WbsDependency, WbsDependencyType } from '../types';

export const wbsDependenciesApi = {
  byProject: (projectId: number, versionId?: number) =>
    api.get<WbsDependency[]>(`/wbs-dependencies/by-project/${projectId}${versionId != null ? `?versionId=${versionId}` : ''}`),
  byWbs: (wbsItemId: number) =>
    api.get<WbsDependency[]>(`/wbs-dependencies/by-wbs/${wbsItemId}`),
  create: (predecessorId: number, successorId: number, type: WbsDependencyType = 'FinishToStart', lagDays = 0) =>
    api.post<WbsDependency>('/wbs-dependencies', { predecessorId, successorId, type, lagDays }),
  delete: (predecessorId: number, successorId: number) =>
    api.delete(`/wbs-dependencies/by-pred/${predecessorId}/by-succ/${successorId}`),
  // 임계경로(CPM).
  criticalPath: (projectId: number, versionId?: number, skipWeekends = true) =>
    api.get<CriticalPath>(`/wbs-dependencies/critical-path/${projectId}?skipWeekends=${skipWeekends}${versionId != null ? `&versionId=${versionId}` : ''}`),
  // 자동 리스케줄 미리보기(저장 안 함).
  reschedulePreview: (projectId: number, fromWbsItemId: number, skipWeekends = true) =>
    api.get<RescheduleResult>(`/wbs-dependencies/reschedule-preview/${projectId}/from/${fromWbsItemId}?skipWeekends=${skipWeekends}`),
  // 리스케줄 적용.
  rescheduleApply: (projectId: number, preview: RescheduleResult) =>
    api.post<RescheduleResult>(`/wbs-dependencies/reschedule-apply/${projectId}`, preview),
};
