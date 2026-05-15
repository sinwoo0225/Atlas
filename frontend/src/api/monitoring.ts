import { api } from './client';
import type { MonitoringData, MonitoringCharts } from '../types';

export const monitoringApi = {
  getToday: () => api.get<MonitoringData>('/monitoring/today'),
  getCharts: () => api.get<MonitoringCharts>('/monitoring/charts'),
};
