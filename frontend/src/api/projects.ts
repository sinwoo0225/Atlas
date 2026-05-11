import { api } from './client';
import type { Project, ProjectDashboard } from '../types';

export const projectsApi = {
  getAll: () => api.get<Project[]>('/projects'),
  getById: (id: number) => api.get<Project>(`/projects/${id}`),
  getDashboard: (id: number) => api.get<ProjectDashboard>(`/projects/${id}/dashboard`),
  create: (data: Omit<Project, 'id' | 'folderPath' | 'createdAt' | 'updatedAt'>) =>
    api.post<Project>('/projects', data),
  update: (id: number, data: Omit<Project, 'id' | 'folderPath' | 'createdAt' | 'updatedAt'>) =>
    api.put<Project>(`/projects/${id}`, data),
  delete: (id: number) => api.delete(`/projects/${id}`),
  backup: async (id: number, projectName: string) => {
    const res = await fetch(`/api/projects/${id}/backup`, { method: 'POST' });
    if (!res.ok) throw new Error(`Backup failed: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = (projectName || `project_${id}`).replace(/[\\/:*?"<>|]/g, '');
    a.href = url;
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
    a.download = `${safe}_backup_${stamp}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
