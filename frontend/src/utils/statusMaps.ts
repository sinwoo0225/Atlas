import type { BadgeVariant } from '../components/ui/Badge';
import type { ProjectStatus, WbsStatus, ImpactLevel, IssueStatus, IssuePriority, DevInfoType } from '../types';

export const projectStatusBadge: Record<ProjectStatus, { label: string; variant: BadgeVariant }> = {
  Planned:    { label: '계획', variant: 'neutral' },
  Waiting:    { label: '대기', variant: 'info' },
  InProgress: { label: '진행', variant: 'warning' },
  Done:       { label: '완료', variant: 'success' },
};

export const wbsStatusBadge: Record<WbsStatus, { label: string; variant: BadgeVariant }> = {
  Planned:    { label: '예정', variant: 'neutral' },
  InProgress: { label: '진행', variant: 'warning' },
  Done:       { label: '완료', variant: 'success' },
};

export const impactBadge: Record<ImpactLevel, { variant: BadgeVariant }> = {
  Low:      { variant: 'success' },
  Medium:   { variant: 'info' },
  High:     { variant: 'warning' },
  Critical: { variant: 'danger' },
};

export const issueStatusBadge: Record<IssueStatus, { label: string; variant: BadgeVariant }> = {
  Open:       { label: '열림',   variant: 'danger'  },
  InProgress: { label: '진행중', variant: 'warning' },
  Resolved:   { label: '해결됨', variant: 'success' },
  Closed:     { label: '닫힘',   variant: 'neutral' },
};

export const issuePriorityBadge: Record<IssuePriority, { label: string; variant: BadgeVariant }> = {
  High:   { label: '높음', variant: 'danger'  },
  Medium: { label: '중간', variant: 'warning' },
  Low:    { label: '낮음', variant: 'neutral' },
};

/** WBS 중요도(order 정수): 3=높음 / 2=중간 / 1=낮음. 0 등 미설정은 중간으로 간주. */
export function wbsImportanceBadge(order: number): { label: string; variant: BadgeVariant } {
  if (order >= 3) return { label: '높음', variant: 'danger' };
  if (order === 1) return { label: '낮음', variant: 'neutral' };
  return { label: '중간', variant: 'warning' };
}

export const devInfoTypeBadge: Record<DevInfoType, { variant: BadgeVariant }> = {
  Markdown: { variant: 'neutral' },
  File:     { variant: 'warning' },
  Link:     { variant: 'success' },
};
