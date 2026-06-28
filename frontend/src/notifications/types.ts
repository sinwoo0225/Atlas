import type { NotificationSettings } from '../store/settings';
import type { NotificationSeverity } from '../store/useNotificationStore';

// 알림 소스가 생성하는 후보 알림. 엔진이 dedupKey 로 중복을 거르고,
// 신규분만 스토어에 적재 + 토스트로 디스패치한다.
export interface NotificationDraft {
  sourceKey: string;
  severity: NotificationSeverity;
  // 렌더 시 `${i18nKey}.title` / `${i18nKey}.body` 를 번역한다.
  i18nKey: string;
  i18nParams?: Record<string, unknown>;
  link?: string;
  // 같은 항목·단계를 재알림하지 않기 위한 고유 키. 예: 'deadline:wbs:42:soon'.
  dedupKey: string;
}

export interface NotificationCollectContext {
  settings: NotificationSettings;
  myResourceId: number | null;
  now: Date;
}

// 알림 종류 1개 = NotificationSource 1개. 확장 지점(요구사항: 향후 항목 추가 고려).
export interface NotificationSource {
  key: string;
  isEnabled: (n: NotificationSettings) => boolean;
  // 현재 시점에 알릴 후보(미전달 여부와 무관) 전부 반환. dedup 은 엔진 책임.
  collect: (ctx: NotificationCollectContext) => Promise<NotificationDraft[]>;
  // 이 소스를 다시 수집하기까지 최소 간격(ms). 미지정이면 매 하트비트(가벼운 시간 체크용).
  // 비용이 큰(서버 조회) 소스는 사용자 폴링 주기로 throttle 한다.
  minIntervalMs?: (n: NotificationSettings) => number;
}
