import { api, type RequestOptions } from './client';
import type { TodoItem, MyWorkItem } from '../types';

export interface MyWorkData {
  items: MyWorkItem[];
}

export const todosApi = {
  list: (params?: { open?: boolean; assigneeResourceId?: number | null; keyword?: string }) => {
    const q = new URLSearchParams();
    if (params?.open) q.set('open', 'true');
    if (params?.assigneeResourceId != null) q.set('assigneeResourceId', String(params.assigneeResourceId));
    if (params?.keyword) q.set('keyword', params.keyword);
    const qs = q.toString();
    return api.get<TodoItem[]>(`/todos${qs ? `?${qs}` : ''}`);
  },
  get: (id: number) => api.get<TodoItem>(`/todos/${id}`),
  create: (data: Partial<TodoItem>) => api.post<TodoItem>('/todos', data),
  update: (id: number, data: Partial<TodoItem>, opts?: RequestOptions) =>
    api.put<TodoItem>(`/todos/${id}`, data, opts),
  complete: (id: number) => api.post<void>(`/todos/${id}/complete`, {}),
  delete: (id: number) => api.delete(`/todos/${id}`),

  // 통합 '내 업무' — assigneeResourceId 생략 시 전체.
  myWork: (assigneeResourceId?: number | null) => {
    const qs = assigneeResourceId != null ? `?assigneeResourceId=${assigneeResourceId}` : '';
    return api.get<MyWorkData>(`/my-work${qs}`);
  },
  completeMyWork: (sourceType: string, id: number) =>
    api.post<void>('/my-work/complete', { sourceType, id }),
};
