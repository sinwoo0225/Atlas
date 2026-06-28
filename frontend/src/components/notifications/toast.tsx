import { toast } from 'sonner';
import type { NotificationSeverity } from '../../store/useNotificationStore';
import { NotificationToastContent } from './NotificationToastContent';

// 알림 토스트는 메인 모니터 우측 하단(요구사항). 기존 시스템/CRUD 토스트는 top-right 유지 —
// sonner 는 단일 글로벌 스토어라 Toaster 를 추가하지 않고 per-toast position 으로 분리한다.
const POSITION = 'bottom-right' as const;
const DURATION = 8000;

interface ToastInput {
  severity: NotificationSeverity;
  i18nKey: string;
  i18nParams?: Record<string, unknown>;
}

export function showNotificationToast(n: ToastInput, onClick?: () => void): void {
  toast.custom(
    (id) => (
      <NotificationToastContent
        severity={n.severity}
        i18nKey={n.i18nKey}
        i18nParams={n.i18nParams}
        onClick={onClick ? () => { onClick(); toast.dismiss(id); } : undefined}
        onClose={() => toast.dismiss(id)}
      />
    ),
    { position: POSITION, duration: DURATION },
  );
}

// 신규 마감 임박 건수가 임계 초과일 때 — 묶음 토스트 1개. 클릭 시 알림 패널/할 일로 유도.
export function showAggregateToast(severity: NotificationSeverity, count: number, onClick: () => void): void {
  toast.custom(
    (id) => (
      <NotificationToastContent
        severity={severity}
        i18nKey="notifications:deadline.aggregate"
        i18nParams={{ count }}
        onClick={() => { onClick(); toast.dismiss(id); }}
        onClose={() => toast.dismiss(id)}
      />
    ),
    { position: POSITION, duration: DURATION },
  );
}
