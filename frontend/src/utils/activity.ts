import type { ActivityLog, ActivityEntityType, ActivityAction } from '../types';

// 활동 피드의 entity 타입별 라벨. 아이콘은 utils/iconRegistry 의 getEntityIcon 으로 조회
// (설정에서 슬롯별 커스터마이즈 가능) — CommandPalette TYPE_META 와 톤 동일.
export const ACTIVITY_TYPE_META: Record<ActivityEntityType, { label: string }> = {
  Project:     { label: '프로젝트' },
  WbsItem:     { label: 'WBS' },
  Issue:       { label: '이슈' },
  Meeting:     { label: '회의록' },
  ChangeLog:   { label: '변경' },
  DevInfoItem: { label: '개발정보' },
  WorkLog:     { label: '업무일지' },
  Resource:    { label: '리소스' },
};

export const ACTION_META: Record<ActivityAction, { label: string; variant: 'success' | 'info' | 'danger' }> = {
  Create: { label: '생성', variant: 'success' },
  Update: { label: '수정', variant: 'info' },
  Delete: { label: '삭제', variant: 'danger' },
  Promote: { label: '승격', variant: 'info' },
};

// 상대 시간 포매팅은 로캘화를 위해 `i18n/format.ts` 의 relativeTime 으로 이동.

// CommandPalette urlFor 와 같은 규약 (?highlight=, ?date=). 두 곳 모두 변경되는 entity 라우팅이 생기면 헬퍼 추출.
export function activityUrl(a: ActivityLog): string | null {
  if (a.entityType === 'Resource') return '/resources';
  const pid = a.projectId;
  if (pid == null) return null;
  switch (a.entityType) {
    case 'Project':     return `/projects/${pid}/dashboard`;
    case 'WbsItem':     return `/projects/${pid}/wbs?highlight=${a.entityId}`;
    case 'Issue':       return `/projects/${pid}/issues?highlight=${a.entityId}`;
    case 'Meeting':     return `/projects/${pid}/meetings?highlight=${a.entityId}`;
    case 'ChangeLog':   return `/projects/${pid}/changelogs?highlight=${a.entityId}`;
    case 'DevInfoItem': return `/projects/${pid}/devinfo?highlight=${a.entityId}`;
    case 'WorkLog': {
      const m = a.entityTitle.match(/(\d{4}-\d{2}-\d{2})/);
      return m ? `/projects/${pid}/worklog?date=${m[1]}` : `/projects/${pid}/worklog`;
    }
    default: return null;
  }
}
