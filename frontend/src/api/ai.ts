import { api } from './client';

// 로컬 Claude Code CLI 연동 (설정에서 옵트인). 상태 비저장 — 텍스트 요약만.
export interface ClaudeCheck {
  available: boolean;
  sample?: string | null;
  error?: string | null;
}

export const aiApi = {
  // 설정의 "테스트" 버튼 — silent: 실패해도 자동 토스트 띄우지 않고 호출부에서 처리.
  claudeCheck: () => api.get<ClaudeCheck>('/ai/claude-check', { silent: true }),
  summarize: (text: string) => api.post<{ summary: string }>('/ai/summarize', { text }),
};
