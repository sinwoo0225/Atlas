import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

// 모듈 스코프 resolver — confirmDialog() 호출과 mount 된 호스트를 연결.
// 호스트가 mount 안 된 상태에서 호출되면 false 즉시 resolve (안전한 fallback).
let resolver: ((v: boolean) => void) | null = null;
let openSetter: ((o: ConfirmOptions | null) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (!openSetter) {
      resolve(false);
      return;
    }
    // 이전 모달이 열려있는 채로 다시 호출되면 이전을 false 로 resolve 하고 새로 띄움.
    resolver?.(false);
    resolver = resolve;
    openSetter(opts);
  });
}

export function ConfirmDialogHost() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    openSetter = setOpts;
    return () => {
      openSetter = null;
      // 컴포넌트 unmount 시 pending resolver 회수.
      resolver?.(false);
      resolver = null;
    };
  }, []);

  // 모달 열림 시 Cancel 버튼에 초기 포커스 — 실수로 Enter 눌러 삭제되는 사고 방지.
  useEffect(() => {
    if (opts) {
      // 다음 tick 에 포커스 — 모달 DOM 이 portal 로 mount 되고 나서.
      const t = setTimeout(() => cancelRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [opts]);

  useEffect(() => {
    if (!opts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        close(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts]);

  const close = (v: boolean) => {
    resolver?.(v);
    resolver = null;
    setOpts(null);
  };

  if (!opts) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4"
      onClick={() => close(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface-1 border border-default rounded-lg p-5 max-w-sm w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-primary">{opts.title}</h3>
        {opts.message && (
          <p className="text-sm text-secondary mt-2 whitespace-pre-wrap">{opts.message}</p>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <Button ref={cancelRef} variant="secondary" onClick={() => close(false)}>
            {opts.cancelLabel ?? '취소'}
          </Button>
          <Button variant={opts.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
            {opts.confirmLabel ?? '확인'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
