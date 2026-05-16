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

export const issueWbsLinksApi = {
  byIssue: (issueId: number) =>
    api.get<IssueWbsLink[]>(`/issue-wbs-links/by-issue/${issueId}`),
  byWbs: (wbsItemId: number) =>
    api.get<IssueWbsLink[]>(`/issue-wbs-links/by-wbs/${wbsItemId}`),
  create: (issueId: number, wbsItemId: number) =>
    api.post<IssueWbsLink>(`/issue-wbs-links`, { issueId, wbsItemId }),
  delete: (issueId: number, wbsItemId: number) =>
    api.delete(`/issue-wbs-links/by-issue/${issueId}/by-wbs/${wbsItemId}`),
};
