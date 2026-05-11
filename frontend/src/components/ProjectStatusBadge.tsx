import type { ProjectStatus } from '../types';

const statusStyle: Record<ProjectStatus, string> = {
  Planned: 'bg-zinc-700/40 text-zinc-300 border-zinc-600/60',
  Waiting: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  InProgress: 'bg-zinc-500/20 text-zinc-200 border-zinc-400/40',
  Done: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

const statusLabel: Record<ProjectStatus, string> = {
  Planned: '계획',
  Waiting: '대기',
  InProgress: '진행',
  Done: '완료',
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${statusStyle[status]}`}>
      {statusLabel[status]}
    </span>
  );
}

export { statusStyle as projectStatusStyle, statusLabel as projectStatusLabel };
