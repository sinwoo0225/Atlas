import { api } from './client';
import type { StartPageData } from '../types';

export const startPageApi = {
  get: () => api.get<StartPageData>('/start-page'),
};
