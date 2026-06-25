import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { Resource } from '../types';
import { parseAssigneeTokens, serializeAssigneeTokens } from '../utils/assigneeTokens';

interface Props {
  value: string;
  onChange: (next: string) => void;
  resources: Resource[];
  placeholder?: string;
}

const VIEWPORT_MARGIN = 8;

export function AssigneeTagInput({ value, onChange, resources, placeholder }: Props) {
  const { t } = useTranslation();
  const tokens = useMemo(() => parseAssigneeTokens(value), [value]);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [placement, setPlacement] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const suggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    const taken = new Set(tokens);
    return resources
      .filter((r) => !taken.has(r.name))
      .filter((r) => (q ? r.name.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [draft, resources, tokens]);

  // Clamp activeIdx into valid range on render (no effect needed).
  const safeActiveIdx = activeIdx >= suggestions.length ? suggestions.length - 1 : activeIdx;

  // 표·카드의 overflow 컨테이너에 잘리거나 스크롤을 만들지 않도록 드롭다운은 portal+fixed 로 띄운다(BadgeMenu 패턴).
  // 입력 박스 기준 아래 배치, 뷰포트 하단 충돌 시 위로 flip. 토큰/후보 수가 바뀌면 재측정.
  useLayoutEffect(() => {
    if (!open) { setPlacement(null); return; }
    if (suggestions.length === 0 || !boxRef.current || !menuRef.current) return;
    const box = boxRef.current.getBoundingClientRect();
    const menuH = menuRef.current.offsetHeight;
    const top = box.bottom + 4 + menuH + VIEWPORT_MARGIN > window.innerHeight
      ? Math.max(VIEWPORT_MARGIN, box.top - menuH - 4)
      : box.bottom + 4;
    setPlacement({ top, left: box.left, width: box.width });
  }, [open, suggestions.length, tokens.length]);

  // 외부 클릭 시 draft 를 토큰으로 커밋(기존 동작) + 닫기. 스크롤/리사이즈 시 닫기(fixed 위치 stale 방지).
  // 드롭다운이 portal 로 body 에 있으므로 박스·메뉴 둘 다 contains 검사.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const node = e.target as Node;
      if (boxRef.current?.contains(node) || menuRef.current?.contains(node)) return;
      const d = draft.trim();
      if (d && !tokens.includes(d)) onChange(serializeAssigneeTokens([...tokens, d]));
      setDraft('');
      setOpen(false);
    };
    const onScrollResize = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
    };
  }, [open, draft, tokens, onChange]);

  const commitToken = (name: string) => {
    const tok = name.trim();
    if (!tok) return;
    if (tokens.includes(tok)) {
      setDraft('');
      return;
    }
    onChange(serializeAssigneeTokens([...tokens, tok]));
    setDraft('');
    setActiveIdx(-1);
  };

  const commitDraft = () => {
    if (draft.trim()) commitToken(draft);
  };

  const removeAt = (idx: number) => {
    const next = tokens.filter((_, i) => i !== idx);
    onChange(serializeAssigneeTokens(next));
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (open && safeActiveIdx >= 0 && safeActiveIdx < suggestions.length) {
        commitToken(suggestions[safeActiveIdx].name);
      } else {
        commitDraft();
      }
      return;
    }
    if (e.key === 'Backspace' && draft === '' && tokens.length > 0) {
      e.preventDefault();
      removeAt(tokens.length - 1);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
    }
  };

  return (
    <div>
      <div
        ref={boxRef}
        className="w-full flex flex-wrap items-center gap-1.5 px-2 py-1.5 text-sm rounded-md bg-surface-2 border border-default focus-within:border-strong transition-colors min-h-[38px]"
        onClick={() => inputRef.current?.focus()}
      >
        {tokens.map((tok, i) => (
          <span
            key={`${tok}-${i}`}
            className="inline-flex items-center gap-1 rounded bg-neutral-soft text-on-neutral px-2 py-0.5 text-xs font-medium"
          >
            {tok}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeAt(i);
              }}
              className="text-muted hover:text-on-danger transition-colors"
              aria-label={t('common:tagInput.remove', { name: tok })}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={tokens.length === 0 ? (placeholder ?? t('common:tagInput.assigneePlaceholder')) : ''}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm py-0.5"
        />
      </div>
      {open && suggestions.length > 0 && createPortal(
        <ul
          ref={menuRef}
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'fixed',
            top: placement?.top ?? -9999,
            left: placement?.left ?? 0,
            width: placement?.width,
            visibility: placement ? 'visible' : 'hidden',
            zIndex: 60,
          }}
          className="max-h-56 overflow-y-auto rounded-md border border-default bg-surface shadow-lg"
        >
          {suggestions.map((r, i) => (
            <li
              key={r.id}
              onMouseDown={(e) => {
                e.preventDefault();
                commitToken(r.name);
                inputRef.current?.focus();
              }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`px-3 py-1.5 text-sm cursor-pointer flex items-center justify-between gap-3 ${
                i === safeActiveIdx ? 'bg-surface-2 text-primary' : 'text-secondary hover:bg-surface-2'
              }`}
            >
              <span>{r.name}</span>
              {r.department && <span className="text-xs text-muted">{r.department}</span>}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
