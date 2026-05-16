import {
  Activity, FolderOpen, CalendarDays, AlertTriangle, FileText,
  GitBranch, Code2, NotebookPen, User,
} from 'lucide-react';
import type { ActivityLog, ActivityEntityType, ActivityAction } from '../types';

// 활동 피드의 entity 타입별 라벨/아이콘 — CommandPalette TYPE_META 와 톤 동일.
export const ACTIVITY_TYPE_META: Record<ActivityEntityType, { label: string; Icon: typeof Activity }> = {
  Project:     { label: '프로젝트',  Icon: FolderOpen },
  WbsItem:     { label: 'WBS',       Icon: CalendarDays },
  Issue:       { label: '이슈',      Icon: AlertTriangle },
  Meeting:     { label: '회의록',    Icon: FileText },
  ChangeLog:   { label: '변경',      Icon: GitBranch },
  DevInfoItem: { label: '개발정보',  Icon: Code2 },
  WorkLog:     { label: '업무일지',  Icon: NotebookPen },
  Resource:    { label: '리소스',    Icon: User },
};

export const ACTION_META: Record<ActivityAction, { label: string; variant: 'success' | 'info' | 'danger' }> = {
  Create: { label: '생성', variant: 'success' },
  Update: { label: '수정', variant: 'info' },
  Delete: { label: '삭제', variant: 'danger' },
};

export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return '방금';
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d === 1) return '어제';
  if (d < 7) return `${d}일 전`;
  return iso.slice(0, 10);
}

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
