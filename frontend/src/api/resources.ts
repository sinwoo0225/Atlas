import { api } from './client';
import type { Resource, ResourceAssignment } from '../types';

export const resourcesApi = {
  getAll: () => api.get<Resource[]>('/resources'),
  getById: (id: number) => api.get<Resource>(`/resources/${id}`),
  getAssignments: (id: number) =>
    api.get<ResourceAssignment[]>(`/resources/${id}/assignments`),
  create: (data: Omit<Resource, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.post<Resource>('/resources', data),
  // 이름으로 Person 리소스 찾기/없으면 생성 (멱등) — '나' 신원 통일용.
  resolve: (name: string) => api.post<Resource>('/resources/resolve', { name }),
  update: (id: number, data: Omit<Resource, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.put<Resource>(`/resources/${id}`, data),
  delete: (id: number) => api.delete(`/resources/${id}`),
};
