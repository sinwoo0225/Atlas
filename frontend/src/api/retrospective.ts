import { api } from './client';
import type { RetrospectiveData } from '../types';

export const retrospectiveApi = {
  get: (projectIds: number[]) =>
    api.get<RetrospectiveData>(`/retrospective?projectIds=${projectIds.join(',')}`),
};
