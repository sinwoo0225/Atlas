import { toast } from 'sonner';
import { loadSettings } from '../store/settings';

const BASE_URL = '/api';

export interface RequestOptions {
  // 4xx/5xx 자동 toast 비활성 — silent fallback 의도 (polling 등) 에 사용.
  silent?: boolean;
}

async function request<T>(path: string, init?: RequestInit, opts?: RequestOptions): Promise<T> {
  // X-Atlas-Actor: 작성자 자동 추적 메타데이터. encodeURIComponent 로 한글 헤더 보호.
  const actor = loadSettings().defaultAuthor;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(actor ? { 'X-Atlas-Actor': encodeURIComponent(actor) } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // 서버가 한국어 메시지를 JSON `error` 필드로 박아둔 경우(409 등) 우선 사용.
    let serverMsg = '';
    try {
      const j = JSON.parse(body);
      if (typeof j?.error === 'string') serverMsg = j.error;
    } catch { /* JSON 아니면 무시 */ }

    if (!opts?.silent) {
      if (res.status === 409) {
        // 동시 편집 충돌은 사용자 액션 (새로고침/재시도) 필요 — 더 오래 띄움.
        toast.error(serverMsg || '다른 사용자가 방금 수정했습니다. 새로고침 후 다시 시도해 주세요.', {
          duration: 6000,
        });
      } else if (res.status >= 500) {
        toast.error(serverMsg || `서버 오류 (${res.status})`);
      } else if (res.status >= 400) {
        toast.error(serverMsg || `요청 처리 실패 (${res.status})`);
      }
    }
    throw new Error(`API error ${res.status}: ${body || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>(path, undefined, opts),
  post: <T>(path: string, body: unknown, opts?: RequestOptions) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }, opts),
  put: <T>(path: string, body: unknown, opts?: RequestOptions) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }, opts),
  delete: (path: string, opts?: RequestOptions) =>
    request<void>(path, { method: 'DELETE' }, opts),
};
