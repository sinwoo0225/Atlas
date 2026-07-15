import type { NotificationAction } from '../store/useNotificationStore';
import { useReleaseNotesModal } from '../store/useReleaseNotesModal';

// 직렬화 가능한 알림 액션 서술자를 실제 동작으로 실행한다.
// 알림은 localStorage 로 저장되므로 클로저를 담을 수 없어, kind → 핸들러 매핑을 여기 한 곳에 둔다.
// 토스트 클릭·종 패널 행 클릭 양쪽이 이 함수를 쓴다.
export function runNotificationAction(action: NotificationAction): void {
  switch (action.kind) {
    case 'releaseNotes':
      useReleaseNotesModal.getState().show(action.version);
      break;
  }
}
