import type { BadgeVariant } from '../components/ui/Badge';
import type { ProjectStatus, WbsStatus, ImpactLevel, IssueStatus, IssuePriority, DevInfoType } from '../types';

// 라벨은 status 네임스페이스의 i18n 키로 보관한다. 호출부에서 t(labelKey) 로 해석해야
// 언어 전환에 반응하므로, 이 맵을 쓰는 컴포넌트는 useTranslation 의 t 를 사용한다.

export const projectStatusBadge: Record<ProjectStatus, { labelKey: string; variant: BadgeVariant }> = {
  // Planned 는 '대기/보류'로 통합 — 잔존 데이터도 같은 라벨로 표시.
  Planned:     { labelKey: 'status:project.Planned', variant: 'info' },
  Waiting:     { labelKey: 'status:project.Waiting', variant: 'info' },
  InProgress:  { labelKey: 'status:project.InProgress', variant: 'warning' },
  Done:        { labelKey: 'status:project.Done', variant: 'success' },
  Maintenance: { labelKey: 'status:project.Maintenance', variant: 'danger' },
};

export const wbsStatusBadge: Record<WbsStatus, { labelKey: string; variant: BadgeVariant }> = {
  Planned:    { labelKey: 'status:wbs.Planned', variant: 'neutral' },
  Waiting:    { labelKey: 'status:wbs.Waiting', variant: 'info' },
  InProgress: { labelKey: 'status:wbs.InProgress', variant: 'warning' },
  Done:       { labelKey: 'status:wbs.Done', variant: 'success' },
};

export const impactBadge: Record<ImpactLevel, { variant: BadgeVariant }> = {
  Low:      { variant: 'success' },
  Medium:   { variant: 'info' },
  High:     { variant: 'warning' },
  Critical: { variant: 'danger' },
};

export const issueStatusBadge: Record<IssueStatus, { labelKey: string; variant: BadgeVariant }> = {
  Open:       { labelKey: 'status:issue.Open',       variant: 'danger'  },
  InProgress: { labelKey: 'status:issue.InProgress', variant: 'warning' },
  Resolved:   { labelKey: 'status:issue.Resolved',   variant: 'success' },
  Closed:     { labelKey: 'status:issue.Closed',     variant: 'neutral' },
};

export const issuePriorityBadge: Record<IssuePriority, { labelKey: string; variant: BadgeVariant }> = {
  High:   { labelKey: 'status:priority.High',   variant: 'danger'  },
  Medium: { labelKey: 'status:priority.Medium', variant: 'warning' },
  Low:    { labelKey: 'status:priority.Low',    variant: 'neutral' },
};

/** WBS 중요도(importance 정수): 3=높음 / 2=중간 / 1=낮음. 0 등 미설정은 중간으로 간주. */
export function wbsImportanceBadge(importance: number): { labelKey: string; variant: BadgeVariant } {
  if (importance >= 3) return { labelKey: 'status:importance.High', variant: 'danger' };
  if (importance === 1) return { labelKey: 'status:importance.Low', variant: 'neutral' };
  return { labelKey: 'status:importance.Medium', variant: 'warning' };
}

export const devInfoTypeBadge: Record<DevInfoType, { variant: BadgeVariant }> = {
  Markdown: { variant: 'neutral' },
  File:     { variant: 'warning' },
  Link:     { variant: 'success' },
  GitRepo:  { variant: 'info' },
};
