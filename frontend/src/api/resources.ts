import { api } from './client';
import type { Resource, ResourceAssignment } from '../types';

// 용량 필드(주당 가용·단가·스킬·활성)는 백엔드에 기본값이 있어 입력 시 선택 — 빠른 등록은 생략 가능.
type ResourceCapacityFields = 'weeklyCapacityHours' | 'costRate' | 'billRate' | 'skills' | 'isActive';
export type ResourceInput =
  Omit<Resource, 'id' | 'createdAt' | 'updatedAt' | ResourceCapacityFields>
  & Partial<Pick<Resource, ResourceCapacityFields>>;

export const resourcesApi = {
  getAll: () => api.get<Resource[]>('/resources'),
  getById: (id: number) => api.get<Resource>(`/resources/${id}`),
  getAssignments: (id: number) =>
    api.get<ResourceAssignment[]>(`/resources/${id}/assignments`),
  create: (data: ResourceInput) => api.post<Resource>('/resources', data),
  // 이름으로 Person 리소스 찾기/없으면 생성 (멱등) — '나' 신원 통일용.
  resolve: (name: string) => api.post<Resource>('/resources/resolve', { name }),
  update: (id: number, data: ResourceInput) => api.put<Resource>(`/resources/${id}`, data),
  delete: (id: number) => api.delete(`/resources/${id}`),
};
