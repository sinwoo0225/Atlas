import { useCallback, useEffect, useRef, useState } from 'react';
import { applyAppearance, loadSettings } from '../store/settings';
import i18n from '../i18n';
import { onHostToast, notifyToastReady, notifyToastEmpty } from '../utils/hostBridge';
import { NotificationToastContent } from '../components/notifications/NotificationToastContent';
import type { NotificationSeverity } from '../store/useNotificationStore';

const DURATION = 8000;
const MAX_VISIBLE = 4;

interface ActiveToast {
  id: number;
  severity: NotificationSeverity;
  i18nKey: string;
  i18nParams?: Record<string, unknown>;
}

// 최소화 시 노출되는 네이티브 always-on-top 토스트 창(ToastForm)이 로드하는 셸.
// MainShell 밖 라우트라 알림 엔진이 여기서 다시 돌지 않는다(중복 방지). 호스트가 push 한
// 토스트만 받아 우하단에 쌓아 보여준다. 테마·언어는 공유 localStorage 로 그대로 적용.
export function NotifyToastWindow() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, number>>(new Map());

  const remove = useCallback((id: number) => {
    const t = timersRef.current.get(id);
    if (t) {
      window.clearTimeout(t);
      timersRef.current.delete(id);
    }
    setToasts((list) => {
      const next = list.filter((x) => x.id !== id);
      if (next.length === 0) notifyToastEmpty(); // 비면 호스트가 창을 숨김
      return next;
    });
  }, []);

  useEffect(() => {
    // 배경 투명 — 카드만 보이고 나머지는 클릭 통과(ToastForm TransparencyKey).
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    const applyCurrent = () => {
      const s = loadSettings();
      applyAppearance(s);
      if (i18n.language !== s.language) i18n.changeLanguage(s.language);
    };
    applyCurrent();

    const off = onHostToast((p) => {
      applyCurrent(); // 메인 창에서 테마/언어를 바꿨을 수 있어 매번 최신화
      const id = ++idRef.current;
      setToasts((list) => [...list, { id, severity: p.severity as NotificationSeverity, i18nKey: p.i18nKey, i18nParams: p.i18nParams }].slice(-MAX_VISIBLE));
      const timer = window.setTimeout(() => remove(id), DURATION);
      timersRef.current.set(id, timer);
    });

    notifyToastReady(); // 리스너 부착 완료 — 호스트가 대기 중 payload flush
    const timers = timersRef.current;
    return () => {
      off();
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
    };
  }, [remove]);

  return (
    <div
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'flex-end',
      }}
    >
      {toasts.map((t) => (
        <NotificationToastContent
          key={t.id}
          severity={t.severity}
          i18nKey={t.i18nKey}
          i18nParams={t.i18nParams}
          onClose={() => remove(t.id)}
        />
      ))}
    </div>
  );
}
