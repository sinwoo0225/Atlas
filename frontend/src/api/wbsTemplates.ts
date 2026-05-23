import { api } from './client';
import type { WbsTemplate, WbsTemplateSummary, WbsTemplateNode } from '../types';

export interface ApplyTemplatePayload {
  templateId?: number | null;
  builtinKey?: string | null;
  anchorDate?: string | null;
  versionId?: number | null;
  skipWeekends: boolean;
}

export const wbsTemplatesApi = {
  list: () => api.get<WbsTemplateSummary[]>('/wbs-templates'),
  get: (id: number) => api.get<WbsTemplate>(`/wbs-templates/${id}`),
  getBuiltin: (key: string) => api.get<WbsTemplate>(`/wbs-templates/builtin/${encodeURIComponent(key)}`),
  create: (data: { name: string; description: string; category: string; nodes: WbsTemplateNode[] }) =>
    api.post<WbsTemplate>('/wbs-templates', data),
  update: (id: number, data: { name: string; description: string; category: string; nodes: WbsTemplateNode[]; updatedAt: string }) =>
    api.put<WbsTemplate>(`/wbs-templates/${id}`, data),
  delete: (id: number) => api.delete(`/wbs-templates/${id}`),
  fromProject: (data: { projectId: number; name: string; description: string; category: string; versionId?: number | null }) =>
    api.post<WbsTemplate>('/wbs-templates/from-project', data),
  apply: (projectId: number, data: ApplyTemplatePayload) =>
    api.post<{ createdCount: number }>(`/projects/${projectId}/wbs/apply-template`, data),
};
