import { api } from './client';
import type { MonitoringData } from '../types';

export const monitoringApi = {
  getToday: () => api.get<MonitoringData>('/monitoring/today'),
};
