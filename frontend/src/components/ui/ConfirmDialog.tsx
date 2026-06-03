/* eslint-disable react-refresh/only-export-components -- confirmDialog 유틸 + Host 컴포넌트 의도적 콜로케이션 (dev HMR 전용 규칙) */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((v: boolean) => {
    resolver?.(v);
    resolver = null;
    setOpts(null);
  }, []);

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
  // <Button autoFocus> 가 일차 보장, rAF 가 이차 안전망 (WebView2 의 focus race 대응).
  useEffect(() => {
    if (!opts) return;
    const id = requestAnimationFrame(() => cancelRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [opts]);

  // Escape 만 window 레벨로 잡음. Enter 는 포커스된 버튼의 native click 으로 자연스럽게 처리되도록 둔다 —
  // window 핸들러로 Enter 를 항상 confirm 으로 잡으면 초기 포커스 설정이 무의미해진다.
  useEffect(() => {
    if (!opts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opts, close]);

  if (!opts) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4"
      onClick={() => close(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface border border-default rounded-lg p-5 max-w-sm w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-primary">{opts.title}</h3>
        {opts.message && (
          <p className="text-sm text-secondary mt-2 whitespace-pre-wrap">{opts.message}</p>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <Button ref={cancelRef} autoFocus variant="secondary" onClick={() => close(false)}>
            {opts.cancelLabel ?? t('cancel')}
          </Button>
          <Button variant={opts.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
            {opts.confirmLabel ?? t('confirm')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
