import { useEffect } from 'react';

// 전역 키보드 단축키. 두 형식 지원:
//   - 'mod+k'  → 단일 콤보. mod = Ctrl(win) / Cmd(mac). input/textarea 안에서도 발화.
//   - 'g d'    → 시퀀스 (공백 구분). 첫 키 후 SEQUENCE_TIMEOUT 안 두 번째 키. modifier 금지.
//                 시퀀스는 입력 중(input/textarea/contentEditable) 매칭하지 않는다 — 글자 입력과 충돌.
export function useGlobalShortcut(combo: string, handler: (e: KeyboardEvent) => void) {
  useEffect(() => {
    if (combo.includes(' ')) {
      const [first, second] = combo.toLowerCase().split(/\s+/).filter(Boolean);
      function onKey(e: KeyboardEvent) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (isTyping(e.target)) return;
        const key = e.key.toLowerCase();
        const now = Date.now();
        if (lastSequenceKey && now - lastSequenceKey.at <= SEQUENCE_TIMEOUT_MS && lastSequenceKey.key === first && key === second) {
          lastSequenceKey = null;
          e.preventDefault();
          e.stopPropagation();
          handler(e);
          return;
        }
        if (key === first) {
          lastSequenceKey = { key: first, at: now };
        }
      }
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
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

const SEQUENCE_TIMEOUT_MS = 1000;
let lastSequenceKey: { key: string; at: number } | null = null;

function isTyping(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
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
