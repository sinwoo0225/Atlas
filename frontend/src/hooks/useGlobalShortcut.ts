import { useEffect } from 'react';

// 전역 키보드 단축키. 'mod+k' 는 win 의 Ctrl+K, mac 의 Cmd+K 모두 매칭.
// input/textarea 안에서 입력 중에도 발화 — 검색 단축키는 어디서나 열려야 한다.
export function useGlobalShortcut(combo: string, handler: (e: KeyboardEvent) => void) {
  useEffect(() => {
    const parsed = parseCombo(combo);
    function onKey(e: KeyboardEvent) {
      if (!matches(e, parsed)) return;
      e.preventDefault();
      e.stopPropagation();
      handler(e);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo, handler]);
}

interface ParsedCombo {
  mod: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

function parseCombo(combo: string): ParsedCombo {
  const parts = combo.toLowerCase().split('+').map((p) => p.trim());
  return {
    mod: parts.includes('mod') || parts.includes('ctrl') || parts.includes('cmd'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key: parts[parts.length - 1],
  };
}

function matches(e: KeyboardEvent, c: ParsedCombo): boolean {
  if (c.mod && !(e.ctrlKey || e.metaKey)) return false;
  if (!c.mod && (e.ctrlKey || e.metaKey)) return false;
  if (c.shift !== e.shiftKey) return false;
  if (c.alt !== e.altKey) return false;
  return e.key.toLowerCase() === c.key;
}
