import type { BadgeVariant } from '../components/ui/Badge';
import type { ProjectStatus, WbsStatus, ImpactLevel } from '../types';

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
