import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Badge, type BadgeVariant } from './Badge';

export interface BadgeMenuOption<T extends string> {
  value: T;
  label: string;
  variant: BadgeVariant;
}

interface Props<T extends string> {
  value: T;
  options: BadgeMenuOption<T>[];
  onChange: (next: T) => void;
  size?: 'sm' | 'md';
  title?: string;
}

const VIEWPORT_MARGIN = 8;

// 표나 카드의 overflow-hidden 부모 안에서도 잘리지 않도록 portal 로 body 에 mount.
// 트리거의 getBoundingClientRect() 기준 fixed positioning + viewport edge 충돌 시 위쪽/오른쪽으로 flip.
// 스크롤/리사이즈 시 닫는다.
// 키보드: 트리거에서 Enter/Space/↓ 로 열기, 메뉴에서 ↑/↓ 이동·Enter 선택·Esc/Tab 닫기(트리거 포커스 복귀).
// ARIA: 트리거 aria-haspopup=listbox/aria-expanded, 메뉴 role=listbox + aria-activedescendant, 옵션 role=option.
export function BadgeMenu<T extends string>({
  value, options, onChange, size = 'sm', title,
}: Props<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [placement, setPlacement] = useState<{ top: number; left: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const currentIndex = Math.max(0, options.findIndex((o) => o.value === value));

  const openMenu = () => {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    setPlacement(null);
    setActiveIndex(currentIndex);
    setOpen(true);
  };
  const closeMenu = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };
  const select = (v: T) => { onChange(v); closeMenu(true); };

  useEffect(() => {
    if (!open) return;
    function handleDown(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false); // 외부 클릭 — 포커스 복귀 불필요(마우스 조작)
    }
    function handleScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener('mousedown', handleDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open]);

  // 첫 렌더는 visibility:hidden 으로 menu 크기 측정 → viewport 충돌 시 flip → visible.
  useLayoutEffect(() => {
    if (!open || !rect || !menuRef.current) return;
    const menuH = menuRef.current.offsetHeight;
    const menuW = menuRef.current.offsetWidth;
    const wantTop = rect.bottom + 4;
    const wantLeft = rect.left;
    const top = wantTop + menuH + VIEWPORT_MARGIN > window.innerHeight
      ? Math.max(VIEWPORT_MARGIN, rect.top - menuH - 4)
      : wantTop;
    const left = wantLeft + menuW + VIEWPORT_MARGIN > window.innerWidth
      ? Math.max(VIEWPORT_MARGIN, rect.right - menuW)
      : wantLeft;
    setPlacement({ top, left });
  }, [open, rect]);

  // 배치 확정 후 메뉴 컨테이너에 포커스 → 키보드 이벤트 수신 + aria-activedescendant 안내.
  useEffect(() => {
    if (open && placement && menuRef.current) menuRef.current.focus();
  }, [open, placement]);

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenu();
    }
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % options.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + options.length) % options.length);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (options[activeIndex]) select(options[activeIndex].value);
        break;
      case 'Escape':
        e.preventDefault();
        closeMenu(true);
        break;
      case 'Tab':
        e.preventDefault();
        closeMenu(true);
        break;
    }
  };

  const current = options[currentIndex] ?? options[0];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (open) closeMenu(); else openMenu();
        }}
        onKeyDown={handleTriggerKeyDown}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="cursor-pointer inline-flex items-center gap-0.5"
      >
        <Badge variant={current.variant} size={size}>{current.label}</Badge>
        <ChevronDown size={12} className="text-muted shrink-0" aria-hidden="true" />
      </button>
      {open && rect && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          tabIndex={-1}
          aria-label={title ?? t('common:selectOption')}
          aria-activedescendant={`${baseId}-opt-${activeIndex}`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleMenuKeyDown}
          style={{
            position: 'fixed',
            top: placement?.top ?? rect.bottom + 4,
            left: placement?.left ?? rect.left,
            minWidth: Math.max(rect.width, 128),
            visibility: placement ? 'visible' : 'hidden',
          }}
          className="z-50 bg-surface-2 border border-default rounded-md shadow-lg py-1 outline-none"
        >
          {options.map((o, i) => (
            <button
              key={o.value}
              id={`${baseId}-opt-${i}`}
              role="option"
              aria-selected={o.value === value}
              type="button"
              tabIndex={-1}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => select(o.value)}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center justify-between gap-2 ${i === activeIndex ? 'bg-surface-3' : ''} ${o.value === value ? 'text-primary' : 'text-secondary'}`}
            >
              <Badge variant={o.variant} size="sm">{o.label}</Badge>
              {o.value === value && <span className="text-xs text-accent">✓</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
