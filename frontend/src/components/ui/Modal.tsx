import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Card } from './Card';
import { confirmDialog } from './ConfirmDialog';

type Size = 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'wide';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: Size;
  fixedHeight?: boolean;
  footer?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEsc?: boolean;
  /** true 면 ESC/overlay/X 클릭 시 ConfirmDialog 로 변경사항 확인. 폼이 dirty 상태 관리해서 전달. */
  dirty?: boolean;
  children: ReactNode;
}

const sizeCls: Record<Size, string> = {
  sm:   'max-w-md',
  md:   'max-w-lg',
  lg:   'max-w-2xl',
  xl:   'max-w-3xl',
  xxl:  'max-w-5xl',
  wide: 'max-w-[95vw]',
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  size = 'lg',
  fixedHeight = false,
  footer,
  initialFocusRef,
  showCloseButton = false,
  closeOnOverlayClick = true,
  closeOnEsc = true,
  dirty = false,
  children,
}: ModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // dirty 폼은 닫기 전 확인. 저장 버튼은 onClose 우회 (form 자체 onSubmit) — confirmDialog 없음.
  const requestClose = useCallback(async () => {
    if (!dirty) {
      onClose();
      return;
    }
    const ok = await confirmDialog({
      title: '변경사항이 있습니다',
      message: '저장하지 않은 변경사항이 사라집니다. 닫으시겠습니까?',
      confirmLabel: '닫기',
      danger: true,
    });
    if (ok) onClose();
  }, [dirty, onClose]);

  // 초기 포커스 — ConfirmDialog 패턴 그대로. rAF 가 WebView2 의 focus race 회피.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
        return;
      }
      const first = containerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open, initialFocusRef]);

  // ESC — window 레벨 + active element 검사로 다른 portal (palette/confirm) 에 우선권.
  // 다른 portal 이 위에 떠있으면 focus 가 그쪽 element 에 있어 yield. 그게 닫혀 focus 가
  // body 로 빠지면 그 다음 ESC 부터 모달이 처리. 모달 단독 시는 active 가 모달 안.
  // Tab focus-trap — container 레벨. focus 가 모달 안에 있을 때만 의미가 있어 자연 적합.
  useEffect(() => {
    if (!open) return;
    const root = containerRef.current;
    if (!root) return;

    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !closeOnEsc) return;
      const active = document.activeElement;
      // active 가 모달 밖 + body 아님 = 다른 portal 안에서 발화 → yield.
      if (active && active !== document.body && !root.contains(active)) return;
      e.preventDefault();
      e.stopPropagation();
      requestClose();
    };
    window.addEventListener('keydown', onEsc);

    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !root.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    root.addEventListener('keydown', onTab);

    return () => {
      window.removeEventListener('keydown', onEsc);
      root.removeEventListener('keydown', onTab);
    };
  }, [open, closeOnEsc, requestClose]);

  // scroll-lock — 모달 열림 동안 배경 body 스크롤 차단. 다중 모달이 동시 열려도 카운터로 정합.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const containerCls = `w-full ${sizeCls[size]} ${fixedHeight ? 'h-[85vh] flex flex-col' : ''}`;

  return createPortal(
    <div
      className="modal-overlay fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => {
        if (closeOnOverlayClick && e.target === e.currentTarget) requestClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div ref={containerRef} className="contents">
        <Card padding="spacious" className={containerCls}>
          {(title || showCloseButton) && (
            <div className="flex items-center justify-between mb-4 shrink-0">
              {title ? <h2 className="h-section">{title}</h2> : <span />}
              {showCloseButton && (
                <button
                  type="button"
                  onClick={() => requestClose()}
                  className="p-1 text-muted hover:text-primary transition-colors"
                  aria-label="닫기"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          )}
          {children}
          {footer && (
            <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-default shrink-0">
              {footer}
            </div>
          )}
        </Card>
      </div>
    </div>,
    document.body,
  );
}
