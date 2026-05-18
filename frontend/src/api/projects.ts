import { api } from './client';
import { loadSettings } from '../store/settings';
import type { Project, ProjectDashboard, ImportPreviewItem, ImportProjectResult } from '../types';

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
  // multipart 라 api wrapper 우회. X-Atlas-Actor 헤더는 직접 합성.
  importPreview: async (file: File): Promise<ImportPreviewItem[]> => {
    const fd = new FormData();
    fd.append('file', file);
    const actor = loadSettings().defaultAuthor;
    const headers: Record<string, string> = actor ? { 'X-Atlas-Actor': encodeURIComponent(actor) } : {};
    const res = await fetch('/api/projects/import/preview', { method: 'POST', headers, body: fd });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let msg = '백업 zip 분석 실패';
      try { const j = JSON.parse(body); if (typeof j?.error === 'string') msg = j.error; } catch { /* ignore */ }
      throw new Error(msg);
    }
    return await res.json();
  },
  import: async (file: File, sourceProjectId: number): Promise<ImportProjectResult> => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('sourceProjectId', String(sourceProjectId));
    const actor = loadSettings().defaultAuthor;
    const headers: Record<string, string> = actor ? { 'X-Atlas-Actor': encodeURIComponent(actor) } : {};
    const res = await fetch('/api/projects/import', { method: 'POST', headers, body: fd });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let msg = '가져오기 실패';
      try { const j = JSON.parse(body); if (typeof j?.error === 'string') msg = j.error; } catch { /* ignore */ }
      throw new Error(msg);
    }
    return await res.json();
  },
};
