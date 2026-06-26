import { api, type RequestOptions } from './client';
import type { WbsItem, WbsVersion, WbsSubtask } from '../types';

export const wbsApi = {
  getByProject: (projectId: number, versionId?: number) =>
    api.get<WbsItem[]>(`/projects/${projectId}/wbs${versionId ? `?versionId=${versionId}` : ''}`),
  // 단건 GET — 사이클 12 충돌 가드에서 서버 최신 값 다시 받기 위해.
  get: (projectId: number, id: number) =>
    api.get<WbsItem>(`/projects/${projectId}/wbs/${id}`),
  create: (data: Omit<WbsItem, 'id' | 'createdAt' | 'updatedAt' | 'children'>) =>
    api.post<WbsItem>(`/projects/${data.projectId}/wbs`, data),
  update: (projectId: number, id: number, data: Partial<WbsItem>, opts?: RequestOptions) =>
    api.put<WbsItem>(`/projects/${projectId}/wbs/${id}`, data, opts),
  delete: (projectId: number, id: number) =>
    api.delete(`/projects/${projectId}/wbs/${id}`),
  getVersions: (projectId: number) =>
    api.get<WbsVersion[]>(`/projects/${projectId}/wbs-versions`),
  createVersion: (data: { projectId: number; versionName: string; description: string }) =>
    api.post<WbsVersion>(`/projects/${data.projectId}/wbs-versions`, data),
  setCurrentVersion: (projectId: number, versionId: number) =>
    api.put<void>(`/projects/${projectId}/wbs-versions/${versionId}/set-current`, {}),
  // 기준선 — 현재 계획 일정을 baseline 으로 박제/비움(선택 시 버전 한정).
  captureBaseline: (projectId: number, versionId?: number) =>
    api.post<{ captured: number }>(`/projects/${projectId}/wbs/baseline/capture${versionId ? `?versionId=${versionId}` : ''}`, {}),
  clearBaseline: (projectId: number, versionId?: number) =>
    api.post<{ cleared: number }>(`/projects/${projectId}/wbs/baseline/clear${versionId ? `?versionId=${versionId}` : ''}`, {}),
  // 서브태스크(경량 체크리스트) — 작업 양식 안에서 TODO 식 추가/완료.
  listSubtasks: (projectId: number, wbsItemId: number) =>
    api.get<WbsSubtask[]>(`/projects/${projectId}/wbs/${wbsItemId}/subtasks`),
  addSubtask: (projectId: number, wbsItemId: number, title: string) =>
    api.post<WbsSubtask>(`/projects/${projectId}/wbs/${wbsItemId}/subtasks`, { title }),
  updateSubtask: (projectId: number, wbsItemId: number, id: number, data: { title?: string; isDone?: boolean }) =>
    api.patch<WbsSubtask>(`/projects/${projectId}/wbs/${wbsItemId}/subtasks/${id}`, data),
  deleteSubtask: (projectId: number, wbsItemId: number, id: number) =>
    api.delete(`/projects/${projectId}/wbs/${wbsItemId}/subtasks/${id}`),
};
