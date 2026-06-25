import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  value: string;
  suggestions: string[];
  onCommit: (next: string) => void;
  placeholder?: string;
  className?: string;
  title?: string;
}

const VIEWPORT_MARGIN = 8;

// 단일값 분류 입력 — 평문처럼 보이는 ghost input + 포커스 시 기존 값 드롭다운(자동완성).
// 표 셀의 overflow-x-auto 에 잘리지 않도록 BadgeMenu 와 동일하게 portal+fixed 위치, 가장자리 flip,
// 스크롤/리사이즈/외부클릭 시 닫는다. 자유 입력 허용 — 후보에 없어도 Enter/blur 로 커밋.
export function CategoryCombobox({ value, suggestions, onCommit, placeholder, className, title }: Props) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [placement, setPlacement] = useState<{ top: number; left: number; width: number } | null>(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  // 외부(낙관적 갱신·refetch) 값 변경 시 draft 동기화. 커밋 시 value=draft 이므로 평상시 no-op.
  useEffect(() => { setDraft(value); }, [value]);

  const filtered = useMemo(() => {
    const q = draft.trim().toLowerCase();
    return suggestions
      .filter((s) => (q ? s.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [draft, suggestions]);

  const safeActiveIdx = activeIdx >= filtered.length ? filtered.length - 1 : activeIdx;

  const openMenu = () => {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
    setPlacement(null);
    setActiveIdx(-1);
    setOpen(true);
  };

  const commit = (next: string) => {
    const trimmed = next.trim();
    setDraft(trimmed);
    setOpen(false);
    if (trimmed !== value) onCommit(trimmed);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const node = e.target as Node;
      if (inputRef.current?.contains(node) || menuRef.current?.contains(node)) return;
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
  }, [open]);

  // 메뉴 크기 측정 후 viewport 충돌 시 flip.
  useLayoutEffect(() => {
    if (!open || !rect || !menuRef.current) return;
    const menuH = menuRef.current.offsetHeight;
    const top = rect.bottom + 4 + menuH + VIEWPORT_MARGIN > window.innerHeight
      ? Math.max(VIEWPORT_MARGIN, rect.top - menuH - 4)
      : rect.bottom + 4;
    setPlacement({ top, left: rect.left, width: rect.width });
  }, [open, rect, filtered.length]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { openMenu(); return; }
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && safeActiveIdx >= 0 && safeActiveIdx < filtered.length) commit(filtered[safeActiveIdx]);
      else commit(draft);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(value);
      setOpen(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        value={draft}
        title={title}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => { setDraft(e.target.value); if (!open) openMenu(); }}
        onFocus={openMenu}
        onBlur={() => commit(draft)}
        onKeyDown={onKeyDown}
        className={className}
      />
      {open && rect && filtered.length > 0 && createPortal(
        <ul
          ref={menuRef}
          role="listbox"
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'fixed',
            top: placement?.top ?? rect.bottom + 4,
            left: placement?.left ?? rect.left,
            minWidth: Math.max(placement?.width ?? rect.width, 120),
            visibility: placement ? 'visible' : 'hidden',
          }}
          className="z-50 max-h-56 overflow-y-auto rounded-md border border-default bg-surface shadow-lg py-1"
        >
          {filtered.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === safeActiveIdx}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => commit(s)}
              className={`px-3 py-1.5 text-sm cursor-pointer transition-colors ${
                i === safeActiveIdx ? 'bg-surface-2 text-primary' : 'text-secondary hover:bg-surface-2'
              }`}
            >
              {s}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
}
