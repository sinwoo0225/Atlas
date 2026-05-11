import { api } from './client';
import type { Resource, ResourceAssignment } from '../types';

export const resourcesApi = {
  getAll: () => api.get<Resource[]>('/resources'),
  getById: (id: number) => api.get<Resource>(`/resources/${id}`),
  getAssignments: (id: number) =>
    api.get<ResourceAssignment[]>(`/resources/${id}/assignments`),
  create: (data: Omit<Resource, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.post<Resource>('/resources', data),
  update: (id: number, data: Omit<Resource, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.put<Resource>(`/resources/${id}`, data),
  delete: (id: number) => api.delete(`/resources/${id}`),
};
