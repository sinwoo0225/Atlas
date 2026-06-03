import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { parseTagTokens, serializeTagTokens } from '../utils/devInfoTagTokens';

interface Props {
  value: string;
  onChange: (next: string) => void;
  suggestions: string[];
  placeholder?: string;
}

// 콤마 string 컬럼 (`"API, 설계, 문서"`) 을 칩 UX 로 보여주는 입력.
// AssigneeTagInput 과 같은 흐름을 단순화 (Resource 객체 → string).
export function TagSuggestionInput({ value, onChange, suggestions, placeholder }: Props) {
  const { t } = useTranslation();
  const tokens = useMemo(() => parseTagTokens(value), [value]);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = draft.trim().toLowerCase();
    const taken = new Set(tokens.map((tok) => tok.toLowerCase()));
    return suggestions
      .filter((s) => !taken.has(s.toLowerCase()))
      .filter((s) => (q ? s.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [draft, suggestions, tokens]);

  const safeActiveIdx = activeIdx >= filtered.length ? filtered.length - 1 : activeIdx;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        const d = draft.trim();
        if (d && !tokens.some((tok) => tok.toLowerCase() === d.toLowerCase())) {
          onChange(serializeTagTokens([...tokens, d]));
        }
        setDraft('');
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, draft, tokens, onChange]);

  const commitToken = (name: string) => {
    const tok = name.trim();
    if (!tok) return;
    if (tokens.some((x) => x.toLowerCase() === tok.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange(serializeTagTokens([...tokens, tok]));
    setDraft('');
    setActiveIdx(-1);
  };

  const commitDraft = () => {
    if (draft.trim()) commitToken(draft);
  };

  const removeAt = (idx: number) => {
    const next = tokens.filter((_, i) => i !== idx);
    onChange(serializeTagTokens(next));
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (open && safeActiveIdx >= 0 && safeActiveIdx < filtered.length) {
        commitToken(filtered[safeActiveIdx]);
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
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
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
    <div ref={wrapRef} className="relative">
      <div
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
          placeholder={tokens.length === 0 ? (placeholder ?? t('common:tagInput.placeholder')) : ''}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm py-0.5"
        />
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 z-20 max-h-56 overflow-y-auto rounded-md border border-default bg-surface shadow-lg">
          {filtered.map((s, i) => (
            <li
              key={s}
              onMouseDown={(e) => {
                e.preventDefault();
                commitToken(s);
                inputRef.current?.focus();
              }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`px-3 py-1.5 text-sm cursor-pointer ${
                i === safeActiveIdx ? 'bg-surface-2 text-primary' : 'text-secondary hover:bg-surface-2'
              }`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
