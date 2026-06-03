import type { ActivityLog, ActivityEntityType, ActivityAction } from '../types';

// 활동 피드의 entity 타입별 라벨 키(activity:entityType.*). 아이콘은 utils/iconRegistry 의
// getEntityIcon 으로 조회(설정에서 슬롯별 커스터마이즈 가능). 라벨은 소비처에서 t(labelKey).
export const ACTIVITY_TYPE_META: Record<ActivityEntityType, { labelKey: string }> = {
  Project:     { labelKey: 'activity:entityType.Project' },
  WbsItem:     { labelKey: 'activity:entityType.WbsItem' },
  Issue:       { labelKey: 'activity:entityType.Issue' },
  Meeting:     { labelKey: 'activity:entityType.Meeting' },
  ChangeLog:   { labelKey: 'activity:entityType.ChangeLog' },
  DevInfoItem: { labelKey: 'activity:entityType.DevInfoItem' },
  WorkLog:     { labelKey: 'activity:entityType.WorkLog' },
  Resource:    { labelKey: 'activity:entityType.Resource' },
};

export const ACTION_META: Record<ActivityAction, { labelKey: string; variant: 'success' | 'info' | 'danger' }> = {
  Create: { labelKey: 'activity:action.Create', variant: 'success' },
  Update: { labelKey: 'activity:action.Update', variant: 'info' },
  Delete: { labelKey: 'activity:action.Delete', variant: 'danger' },
  Promote: { labelKey: 'activity:action.Promote', variant: 'info' },
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
