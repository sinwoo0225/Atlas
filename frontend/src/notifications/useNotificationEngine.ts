import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadSettings } from '../store/settings';
import { useNotificationStore, type AppNotification } from '../store/useNotificationStore';
import { NOTIFICATION_SOURCES } from './index';
import { loadNotifiedKeys, markNotified } from './runtime';
import { showNotificationToast, showAggregateToast } from '../components/notifications/toast';
import { isHostBridgeAvailable, showHostToast, onWindowMinimized } from '../utils/hostBridge';
import type { NotificationDraft } from './types';

// 가벼운 하트비트 — 매 30초마다 소스를 점검(시간 기반 일일 정리를 제때 발화시키기 위함).
// 비용이 큰 마감(my-work 조회)은 소스의 minIntervalMs(=폴링 주기)로 별도 throttle 한다.
const HEARTBEAT_MS = 30_000;
const FOCUS_THROTTLE_MS = 15_000;

// 알림 엔진 — MainShell 에 1회 마운트. 30초 하트비트 + 포커스/가시성 복귀 시 보정.
// 위젯 셸(/widget)·토스트 창(/notify-toast)에는 마운트하지 않는다.
export function useNotificationEngine(): void {
  const navigate = useNavigate();
  const add = useNotificationStore((s) => s.add);
  const markRead = useNotificationStore((s) => s.markRead);

  // 인터벌 클로저 stale 방지 — 최신 함수 참조를 ref 로 유지(렌더 중이 아닌 effect 에서 갱신).
  const navRef = useRef(navigate);
  const addRef = useRef(add);
  const markReadRef = useRef(markRead);
  useEffect(() => {
    navRef.current = navigate;
    addRef.current = add;
    markReadRef.current = markRead;
  });

  const runningRef = useRef(false);
  const lastRunRef = useRef(0);
  // 소스별 마지막 수집 시각 — minIntervalMs 로 비용 큰 소스(마감) throttle.
  const lastRunBySource = useRef<Record<string, number>>({});
  // 메인 창 최소화 여부 — 호스트가 통지(WebView2 visibilityState 비신뢰 대체).
  const minimizedRef = useRef(false);

  // 호스트 최소화 신호 구독. 최소화 진입 시 즉시 한 번 점검(타이머 throttle 보정).
  useEffect(() => onWindowMinimized((m) => { minimizedRef.current = m; }), []);

  useEffect(() => {
    const tick = async (force: boolean) => {
      if (runningRef.current) return;
      if (!force && Date.now() - lastRunRef.current < FOCUS_THROTTLE_MS) return;

      const settings = loadSettings();
      const cfg = settings.notifications;
      if (!cfg.enabled) return;

      runningRef.current = true;
      lastRunRef.current = Date.now();
      try {
        const now = Date.now();
        const ctx = { settings: cfg, myResourceId: settings.myResourceId, now: new Date(now) };
        const notified = loadNotifiedKeys();
        const newDrafts: NotificationDraft[] = [];

        for (const src of NOTIFICATION_SOURCES) {
          if (!src.isEnabled(cfg)) continue;
          // 소스별 최소 간격 gate — 일일 정리(미지정)는 매 하트비트, 마감은 폴링 주기마다.
          const minIv = src.minIntervalMs?.(cfg) ?? 0;
          const last = lastRunBySource.current[src.key] ?? 0;
          if (minIv > 0 && now - last < minIv) continue;
          lastRunBySource.current[src.key] = now;
          let drafts: NotificationDraft[] = [];
          try {
            drafts = await src.collect(ctx);
          } catch {
            drafts = [];
          }
          for (const dr of drafts) {
            if (notified.has(dr.dedupKey)) continue;
            notified.add(dr.dedupKey); // 같은 틱 내 중복도 방지
            newDrafts.push(dr);
          }
        }
        if (newDrafts.length === 0) return;

        // 1) 패널 이력에 항상 전부 적재.
        const records = newDrafts.map((dr) => ({
          dr,
          rec: addRef.current({
            sourceKey: dr.sourceKey,
            severity: dr.severity,
            i18nKey: dr.i18nKey,
            i18nParams: dr.i18nParams,
            link: dr.link,
          }),
        }));
        markNotified(newDrafts.map((d) => d.dedupKey));

        // 2) 토스트 디스패치 — 창이 보이면 인앱(Sonner, 우하단), 최소화면 네이티브 토스트 창.
        // 네이티브 경로는 표시 전용(클릭 이동은 메인 창 종 아이콘 패널이 담당).
        // 최소화 판정은 호스트 신호(minimizedRef) 우선 + 브라우저 폴백(visibilityState).
        const hidden = minimizedRef.current || document.visibilityState !== 'visible';
        const useNative = hidden && cfg.showWhenMinimized && isHostBridgeAvailable();

        const open = (rec: AppNotification) => {
          markReadRef.current(rec.id);
          if (rec.link) navRef.current(rec.link);
        };
        const emit = (
          severity: NotificationDraft['severity'],
          i18nKey: string,
          i18nParams: Record<string, unknown> | undefined,
          onClick?: () => void,
        ) => {
          if (useNative) showHostToast({ severity, i18nKey, i18nParams });
          else showNotificationToast({ severity, i18nKey, i18nParams }, onClick);
        };

        // 마감(deadline): 신규 건수가 임계 초과면 묶음 토스트 1개, 이하면 항목별.
        const deadlineRecs = records.filter((r) => r.dr.sourceKey === 'deadline');
        if (deadlineRecs.length > cfg.deadline.aggregateThreshold) {
          const anyDanger = deadlineRecs.some((r) => r.dr.severity === 'danger');
          if (useNative) {
            showHostToast({ severity: anyDanger ? 'danger' : 'warning', i18nKey: 'notifications:deadline.aggregate', i18nParams: { count: deadlineRecs.length } });
          } else {
            showAggregateToast(anyDanger ? 'danger' : 'warning', deadlineRecs.length, () => navRef.current('/todos'));
          }
        } else {
          for (const r of deadlineRecs) emit(r.dr.severity, r.dr.i18nKey, r.dr.i18nParams, () => open(r.rec));
        }
        // 그 외(일일 정리 등): 항상 개별.
        for (const r of records.filter((r) => r.dr.sourceKey !== 'deadline')) {
          emit(r.dr.severity, r.dr.i18nKey, r.dr.i18nParams, () => open(r.rec));
        }
      } finally {
        runningRef.current = false;
      }
    };

    void tick(true);
    const interval = window.setInterval(() => void tick(true), HEARTBEAT_MS);

    const onFocus = () => void tick(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick(false);
    };
    // 설정 변경(시각·범위·활성 등) 시 소스 gate 를 초기화하고 즉시 재점검 — 변경이 바로 반영되게.
    const onSettings = () => {
      lastRunBySource.current = {};
      void tick(true);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('atlas:settings-changed', onSettings);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('atlas:settings-changed', onSettings);
    };
  }, []);
}
