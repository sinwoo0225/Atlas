import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { useNotificationStore, selectUnreadCount, type AppNotification } from '../../store/useNotificationStore';
import { relativeTime } from '../../i18n/format';
import { SEVERITY_ICON, SEVERITY_VAR } from './severity';

const PANEL_W = 360;
const MARGIN = 8;

interface Props {
  // 배치별 버튼 스타일(레일 아이콘 / 헤더 아이콘 등).
  className?: string;
  // 패널 열림/닫힘 통지 — 통합 메뉴 드로어(마우스오버)가 패널 열려 있는 동안 닫히지 않게 하는 데 사용.
  onOpenChange?: (open: boolean) => void;
}

// 사이드바 종 아이콘 + 미확인 빨간 점 + 알림 패널(시간 역순). 검색 아이콘 위에 배치(요구사항 7).
export function NotificationBell({ className = '', onOpenChange }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notifications = useNotificationStore((s) => s.notifications);
  const unread = useNotificationStore(selectUnreadCount);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const clear = useNotificationStore((s) => s.clear);

  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [placement, setPlacement] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const openPanel = () => {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setPlacement(null);
    setOpen(true);
  };
  const close = () => setOpen(false);

  // 열림 상태 변화를 부모에 통지(마운트 초기 false 는 건너뜀 — 드로어 자동 닫힘 방지).
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; return; }
    onOpenChange?.(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (btnRef.current?.contains(tgt) || panelRef.current?.contains(tgt)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onScrollResize = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScrollResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScrollResize);
    };
  }, [open]);

  // 사이드바(좌측)에서 우측으로 펼침. 공간 부족 시 좌측/뷰포트 안으로 보정.
  useLayoutEffect(() => {
    if (!open || !rect || !panelRef.current) return;
    const h = panelRef.current.offsetHeight;
    const left =
      rect.right + MARGIN + PANEL_W <= window.innerWidth
        ? rect.right + MARGIN
        : Math.max(MARGIN, window.innerWidth - PANEL_W - MARGIN);
    const top = Math.min(Math.max(MARGIN, rect.top), Math.max(MARGIN, window.innerHeight - h - MARGIN));
    setPlacement({ top, left });
  }, [open, rect, notifications.length]);

  const onRowClick = (n: AppNotification) => {
    markRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close() : openPanel())}
        title={t('notifications:bell.title')}
        aria-label={t('notifications:bell.ariaLabel', { count: unread })}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`relative ${className}`}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 w-2 h-2 rounded-full"
            style={{ backgroundColor: 'var(--danger)', boxShadow: '0 0 0 2px var(--bg-sidebar)' }}
          />
        )}
      </button>

      {open && rect && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t('notifications:panel.title')}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: placement?.top ?? rect.top,
            left: placement?.left ?? rect.right + MARGIN,
            width: PANEL_W,
            maxWidth: '92vw',
            maxHeight: '70vh',
            visibility: placement ? 'visible' : 'hidden',
          }}
          className="z-50 flex flex-col bg-surface border border-default rounded-lg shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-default shrink-0">
            <span className="text-sm font-medium text-primary">{t('notifications:panel.title')}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => markAllRead()}
                disabled={unread === 0}
                title={t('notifications:panel.markAllRead')}
                aria-label={t('notifications:panel.markAllRead')}
                className="p-1.5 rounded text-muted hover:text-primary hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <CheckCheck size={15} />
              </button>
              <button
                type="button"
                onClick={() => clear()}
                disabled={notifications.length === 0}
                title={t('notifications:panel.clearAll')}
                aria-label={t('notifications:panel.clearAll')}
                className="p-1.5 rounded text-muted hover:text-primary hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted">{t('notifications:panel.empty')}</p>
            ) : (
              <ul>
                {notifications.map((n) => {
                  const Icon = SEVERITY_ICON[n.severity] ?? Bell;
                  const title = t(`${n.i18nKey}.title`, n.i18nParams);
                  const body = t(`${n.i18nKey}.body`, { ...n.i18nParams, defaultValue: '' });
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => onRowClick(n)}
                        className={`w-full text-left flex gap-2.5 items-start px-3 py-2.5 border-b border-default last:border-b-0 hover:bg-surface-2 transition-colors ${
                          n.read ? '' : 'bg-accent-soft'
                        }`}
                      >
                        <Icon size={16} className="shrink-0 mt-0.5" style={{ color: SEVERITY_VAR[n.severity] }} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {!n.read && (
                              <span className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--danger)' }} aria-hidden="true" />
                            )}
                            <p className="text-sm text-primary leading-snug break-words">{title}</p>
                          </div>
                          {body && <p className="text-xs text-secondary mt-0.5 leading-snug break-words">{body}</p>}
                          <p className="text-[11px] text-muted mt-1">{relativeTime(new Date(n.createdAt).toISOString())}</p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
