import { systemApi } from '../../api/system';
import type { NotificationDraft, NotificationSource } from '../types';

// 새 버전 알림 — 백그라운드 업데이트 체크(호스트)가 발견해 둔 결과를 읽어 알린다.
// 예전엔 App.tsx 가 시작 시 맨몸 토스트 하나만 띄웠는데(놓치면 끝), 정식 알림 소스로 승격해
// 종 패널에도 남기고 '릴리즈 노트 보기' 액션을 실을 수 있게 했다.
// MSIX/Store 빌드는 호스트가 업데이트 체크 자체를 안 해서 hasUpdate 가 늘 false — 자연히 안 뜬다.
export const updateSource: NotificationSource = {
  key: 'update',
  isEnabled: (n) => n.update.enabled,
  // 상태만 읽는 가벼운 조회지만 매 하트비트는 과하다 — 폴링 주기로 throttle.
  minIntervalMs: (n) => Math.max(5, n.pollIntervalMinutes || 30) * 60_000,
  async collect() {
    let status;
    try {
      status = await systemApi.getUpdateStatus();
    } catch {
      return [];
    }
    const r = status.lastResult;
    if (!r?.hasUpdate) return [];

    const draft: NotificationDraft = {
      sourceKey: 'update',
      severity: 'info',
      i18nKey: 'notifications:update',
      i18nParams: { version: r.latestVersion },
      // 클릭하면 릴리즈 노트 모달. link(라우트)가 아니라 액션이다.
      action: { kind: 'releaseNotes', version: r.latestVersion },
      // 버전당 1회만 — 같은 버전을 매 폴링마다 다시 알리지 않는다.
      dedupKey: `update:${r.latestVersion}`,
    };
    return [draft];
  },
};
