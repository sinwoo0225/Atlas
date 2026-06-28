import { useTranslation } from 'react-i18next';
import { Bell, X } from 'lucide-react';
import type { NotificationSeverity } from '../../store/useNotificationStore';
import { SEVERITY_ICON, SEVERITY_VAR } from './severity';

export interface ToastContentProps {
  severity: NotificationSeverity;
  // `${i18nKey}.title` / `${i18nKey}.body` 를 번역. body 가 없으면 제목만 표시.
  i18nKey: string;
  i18nParams?: Record<string, unknown>;
  onClick?: () => void;
  onClose?: () => void;
}

// 인앱 토스트 + 최소화 시 네이티브 토스트 창(Phase B)이 공유하는 알림 카드.
export function NotificationToastContent({ severity, i18nKey, i18nParams, onClick, onClose }: ToastContentProps) {
  const { t } = useTranslation();
  const Icon = SEVERITY_ICON[severity] ?? Bell;
  const title = t(`${i18nKey}.title`, i18nParams);
  const body = t(`${i18nKey}.body`, { ...i18nParams, defaultValue: '' });

  return (
    <div
      role="alert"
      onClick={onClick}
      className={`w-[330px] max-w-[88vw] flex gap-3 items-start rounded-lg border border-default bg-surface-2 shadow-lg px-3.5 py-3 ${
        onClick ? 'cursor-pointer hover:bg-surface-3 transition-colors' : ''
      }`}
    >
      <Icon size={18} className="shrink-0 mt-0.5" style={{ color: SEVERITY_VAR[severity] }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-primary leading-snug break-words">{title}</p>
        {body && <p className="text-xs text-secondary mt-0.5 leading-snug break-words">{body}</p>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label={t('common:close')}
          className="shrink-0 -mr-1 -mt-0.5 p-0.5 text-muted hover:text-primary transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
