import { api } from './client';
import type { DevInfoType } from '../types';

export interface WbsDevInfoLink {
  id: number;
  wbsItemId: number;
  devInfoItemId: number;
  wbsItemName?: string | null;
  devInfoTitle?: string | null;
  devInfoType?: DevInfoType | null;
  createdAt: string;
  createdBy: string;
}

// 카운트 배지용 경량 tuple.
export interface WbsDevInfoLinkLite {
  wbsItemId: number;
  devInfoItemId: number;
}

export const wbsDevInfoLinksApi = {
  byWbs: (wbsItemId: number) =>
    api.get<WbsDevInfoLink[]>(`/wbs-devinfo-links/by-wbs/${wbsItemId}`),
  byDevInfo: (devInfoItemId: number) =>
    api.get<WbsDevInfoLink[]>(`/wbs-devinfo-links/by-devinfo/${devInfoItemId}`),
  byProject: (projectId: number) =>
    api.get<WbsDevInfoLinkLite[]>(`/wbs-devinfo-links/by-project/${projectId}`),
  create: (wbsItemId: number, devInfoItemId: number) =>
    api.post<WbsDevInfoLink>(`/wbs-devinfo-links`, { wbsItemId, devInfoItemId }),
  delete: (wbsItemId: number, devInfoItemId: number) =>
    api.delete(`/wbs-devinfo-links/by-wbs/${wbsItemId}/by-devinfo/${devInfoItemId}`),
};
