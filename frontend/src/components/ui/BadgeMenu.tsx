import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

// 표나 카드의 overflow-hidden 부모 안에서도 잘리지 않도록 portal 로 body 에 mount.
// 트리거의 getBoundingClientRect() 기준 fixed positioning. 스크롤/리사이즈 시 닫는다.
export function BadgeMenu<T extends string>({
  value, options, onChange, size = 'sm', title,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = () => {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    setOpen(true);
  };
  const closeMenu = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    function handleDown(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      closeMenu();
    }
    function handleScrollOrResize() {
      closeMenu();
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

  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          open ? closeMenu() : openMenu();
        }}
        title={title}
        className="cursor-pointer"
      >
        <Badge variant={current.variant} size={size}>{current.label}</Badge>
      </button>
      {open && rect && createPortal(
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: rect.bottom + 4,
            left: rect.left,
            minWidth: Math.max(rect.width, 128),
          }}
          className="z-50 bg-surface-2 border border-default rounded-md shadow-lg py-1"
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); closeMenu(); }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-3 transition-colors flex items-center justify-between gap-2 ${o.value === value ? 'text-primary' : 'text-secondary'}`}
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
