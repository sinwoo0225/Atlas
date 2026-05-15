import { api } from './client';

export type SearchEntityType =
  | 'Project'
  | 'WbsItem'
  | 'Issue'
  | 'Meeting'
  | 'ChangeLog'
  | 'DevInfoItem'
  | 'WorkLog';

export interface SearchHit {
  type: SearchEntityType;
  id: number;
  projectId: number | null;
  projectName: string | null;
  // <mark>...</mark> 하이라이트가 포함될 수 있는 HTML 부분 문자열.
  // 백엔드 FTS5 의 highlight() / snippet() 결과라 외부 사용자 입력이 아니다 — innerHTML 로 안전하게 렌더.
  title: string;
  snippet: string;
  updatedAt: string;
}

export interface SearchParams {
  q: string;
  types?: SearchEntityType[];
  projectId?: number;
  limit?: number;
}

export function search(params: SearchParams): Promise<SearchHit[]> {
  const qs = new URLSearchParams();
  qs.set('q', params.q);
  if (params.types && params.types.length > 0) qs.set('types', params.types.join(','));
  if (params.projectId != null) qs.set('projectId', String(params.projectId));
  if (params.limit != null) qs.set('limit', String(params.limit));
  return api.get<SearchHit[]>(`/search?${qs.toString()}`);
}

export function rebuildIndex(): Promise<{ rebuilt: number }> {
  return api.post<{ rebuilt: number }>('/search/rebuild', {});
}
