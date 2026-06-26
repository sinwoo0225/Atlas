import { api } from './client';
import type { Issue, IssueCustomColumn } from '../types';

// 와이어 형태: 백엔드 IssueDto 는 customFieldsJson(문자열)·category 를 그대로 노출.
// 프런트는 customFields(파싱된 맵)로 다룬다 — 경계에서 파싱/직렬화한다.
type IssueWire = Omit<Issue, 'customFields'> & { customFieldsJson?: string };

function parseCustomFields(json: string | undefined | null): Record<string, string> | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // 값은 항상 문자열로 정규화 (숫자/날짜도 문자열 저장).
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) out[k] = String(v ?? '');
      return Object.keys(out).length ? out : undefined;
    }
  } catch {
    /* 손상/빈 JSON 은 무시 → 커스텀 값 없음 */
  }
  return undefined;
}

function hydrate(raw: IssueWire): Issue {
  const { customFieldsJson, ...rest } = raw;
  return { ...rest, customFields: parseCustomFields(customFieldsJson) };
}

// 갱신/생성 payload: customFields(맵) → customFieldsJson(문자열). customFields 키가 있을 때만 변환해
// 다른 필드만 수정하는 호출이 커스텀 값을 지우지 않도록 한다.
function dehydrate<T extends Partial<Issue>>(data: T): Record<string, unknown> {
  const body: Record<string, unknown> = { ...data };
  if ('customFields' in data) {
    const cf = data.customFields;
    body.customFieldsJson = cf && Object.keys(cf).length ? JSON.stringify(cf) : '';
    delete body.customFields;
  }
  return body;
}

export const issuesApi = {
  getByProject: (projectId: number) =>
    api.get<IssueWire[]>(`/projects/${projectId}/issues`).then((list) => list.map(hydrate)),
  create: (data: Omit<Issue, 'id' | 'createdAt' | 'updatedAt' | 'assigneeName'>) =>
    api.post<IssueWire>(`/projects/${data.projectId}/issues`, dehydrate(data)).then(hydrate),
  update: (projectId: number, id: number, data: Partial<Issue>) =>
    api.put<IssueWire>(`/projects/${projectId}/issues/${id}`, dehydrate(data)).then(hydrate),
  delete: (projectId: number, id: number) =>
    api.delete(`/projects/${projectId}/issues/${id}`),
  toggleFavorite: (projectId: number, id: number, favorite: boolean) =>
    api.patch<void>(`/projects/${projectId}/issues/${id}/favorite`, { favorite }),

  // 사용자 정의 커스텀 컬럼 정의 (프로젝트 단위). GET 은 배열, PUT 은 전체 교체.
  getColumns: (projectId: number) =>
    api.get<IssueCustomColumn[]>(`/projects/${projectId}/issue-columns`),
  saveColumns: (projectId: number, columns: IssueCustomColumn[]) =>
    api.put<void>(`/projects/${projectId}/issue-columns`, columns),
};
