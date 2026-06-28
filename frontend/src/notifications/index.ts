import type { NotificationSource } from './types';
import { deadlineSource } from './sources/deadlineSource';
import { dailySummarySource } from './sources/dailySummarySource';

// 알림 소스 레지스트리 — 새 알림 종류는 NotificationSource 를 구현해 여기 추가하면
// 엔진이 자동으로 폴링·dedup·디스패치한다. 함께 추가할 것:
//  1) settings.ts NotificationSettings 에 하위 설정 객체
//  2) SettingsPage 알림 탭에 토글/입력
//  3) locales/{ko,en}/notifications.json 에 메시지 키
export const NOTIFICATION_SOURCES: NotificationSource[] = [deadlineSource, dailySummarySource];

export type { NotificationSource, NotificationDraft, NotificationCollectContext } from './types';
