import type { KeyboardEvent } from 'react';

const TAB = '  '; // 2 spaces — 마크다운 들여쓰기 표준 단위

/**
 * Tab 키를 textarea 의 들여쓰기 동작으로 변환.
 *  - Tab        → 커서/선택 위치에 2 스페이스 삽입
 *  - Shift+Tab  → 현재 라인 앞쪽에서 최대 2 스페이스 제거
 *
 * controlled textarea 에서 사용: `onKeyDown={(e) => applyTextareaTab(e, setValue)}`.
 * setValue 는 React state setter (또는 동등한 콜백).
 */
export function applyTextareaTab(
  e: KeyboardEvent<HTMLTextAreaElement>,
  setValue: (next: string) => void,
): void {
  if (e.key !== 'Tab') return;
  e.preventDefault();

  const ta = e.currentTarget;
  const s = ta.selectionStart;
  const end = ta.selectionEnd;
  const v = ta.value;

  if (e.shiftKey) {
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    const head = v.slice(lineStart, lineStart + TAB.length);
    let removed = 0;
    if (head === TAB) removed = TAB.length;
    else if (head.startsWith(' ')) removed = 1;
    if (removed === 0) return;
    const next = v.slice(0, lineStart) + v.slice(lineStart + removed);
    setValue(next);
    requestAnimationFrame(() => {
      const ns = Math.max(lineStart, s - removed);
      const ne = Math.max(lineStart, end - removed);
      ta.selectionStart = ns;
      ta.selectionEnd = ne;
    });
    return;
  }

  const next = v.slice(0, s) + TAB + v.slice(end);
  setValue(next);
  requestAnimationFrame(() => {
    ta.selectionStart = ta.selectionEnd = s + TAB.length;
  });
}
