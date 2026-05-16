import { api } from './client';
import type { MonitoringData, MonitoringCharts, ResourceHeatmap } from '../types';

export const monitoringApi = {
  getToday: () => api.get<MonitoringData>('/monitoring/today'),
  getCharts: () => api.get<MonitoringCharts>('/monitoring/charts'),
  getResourceHeatmap: () => api.get<ResourceHeatmap>('/monitoring/resource-heatmap'),
};
