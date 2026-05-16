import { loadSettings } from '../store/settings';

const BASE_URL = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // X-Atlas-Actor: 작성자 자동 추적용 메타데이터 마커. 서버 SaveChanges 가 CreatedBy/UpdatedBy 를
  // 채움. 한글 사용자명을 ISO-8859-1 헤더 제한에서 보호하려고 encodeURIComponent 로 인코딩 —
  // 서버는 Uri.UnescapeDataString 으로 디코딩한다. 인증 아닌 표시값이므로 위조 가능.
  const actor = loadSettings().defaultAuthor;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(actor ? { 'X-Atlas-Actor': encodeURIComponent(actor) } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path: string) => request<void>(path, { method: 'DELETE' }),
};
