import type { ProjectStatus } from '../types';
import { Badge } from './ui';
import { projectStatusBadge } from '../utils/statusMaps';

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { label, variant } = projectStatusBadge[status];
  return <Badge variant={variant}>{label}</Badge>;
}
