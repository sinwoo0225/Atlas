import { useTranslation } from 'react-i18next';
import type { ProjectStatus } from '../types';
import { Badge } from './ui';
import { projectStatusBadge } from '../utils/statusMaps';

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { t } = useTranslation();
  const { labelKey, variant } = projectStatusBadge[status];
  return <Badge variant={variant}>{t(labelKey)}</Badge>;
}
