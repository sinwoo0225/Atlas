import { api } from './client';

export interface IssueWbsLink {
  id: number;
  issueId: number;
  wbsItemId: number;
  issueTitle?: string | null;
  wbsItemName?: string | null;
  createdAt: string;
  createdBy: string;
}

// 카운트 배지용 경량 tuple (제목·날짜 없음).
export interface IssueWbsLinkLite {
  issueId: number;
  wbsItemId: number;
}

export const issueWbsLinksApi = {
  byIssue: (issueId: number) =>
    api.get<IssueWbsLink[]>(`/issue-wbs-links/by-issue/${issueId}`),
  byWbs: (wbsItemId: number) =>
    api.get<IssueWbsLink[]>(`/issue-wbs-links/by-wbs/${wbsItemId}`),
  byProject: (projectId: number) =>
    api.get<IssueWbsLinkLite[]>(`/issue-wbs-links/by-project/${projectId}`),
  create: (issueId: number, wbsItemId: number) =>
    api.post<IssueWbsLink>(`/issue-wbs-links`, { issueId, wbsItemId }),
  delete: (issueId: number, wbsItemId: number) =>
    api.delete(`/issue-wbs-links/by-issue/${issueId}/by-wbs/${wbsItemId}`),
};
