import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import type { NotificationSeverity } from '../../store/useNotificationStore';

// 토스트·패널이 공유하는 severity → 아이콘/색 매핑. 색은 테마 토큰(CSS 변수)이라 자동 대응.
export const SEVERITY_ICON = {
  info: Info,
  warning: AlertTriangle,
  danger: AlertCircle,
  success: CheckCircle2,
} as const;

export const SEVERITY_VAR: Record<NotificationSeverity, string> = {
  info: 'var(--info)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  success: 'var(--success)',
};
