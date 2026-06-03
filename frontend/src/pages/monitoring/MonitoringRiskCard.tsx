import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, CalendarClock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/ui';
import type { MonitoringRisk, RiskItem } from '../../types';

const MAX_ROWS = 6;

// 개요 상단 전역 Risk Radar — 전 프로젝트의 마감 초과/임박 WBS + High Open 이슈.
// 프로젝트 대시보드의 RiskAlertCard 를 across-project 로 각색. 0 건이면 미노출(시각 노이즈 방지).
export function MonitoringRiskCard({ risk }: { risk: MonitoringRisk | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (!risk) return null;
  const { overdueWbs, dueSoonWbs, highOpenIssues } = risk;
  if (overdueWbs.length + dueSoonWbs.length + highOpenIssues.length === 0) return null;

  const go = (it: RiskItem) =>
    navigate(it.kind === 'wbs'
      ? `/projects/${it.projectId}/wbs?highlight=${it.id}`
      : `/projects/${it.projectId}/issues?highlight=${it.id}`);

  const itemRow = (it: RiskItem, tone: 'danger' | 'warning') => (
    <button
      key={`${it.kind}-${it.id}`}
      type="button"
      onClick={() => go(it)}
      className="w-full text-left flex items-center gap-2 py-1 px-2 -mx-2 rounded hover:bg-surface-2 transition-colors"
    >
      <span className="text-sm text-secondary truncate flex-1 min-w-0">{it.title}</span>
      <span className="text-xs text-muted shrink-0 truncate max-w-[38%]">{it.projectName}</span>
      {it.dueDate && (
        <span className={`text-xs shrink-0 ${tone === 'danger' ? 'text-on-danger' : 'text-on-warning'}`}>
          {it.dueDate}
        </span>
      )}
    </button>
  );

  return (
    <Card
      padding="spacious"
      className="bg-danger-soft"
      style={{ borderColor: 'var(--text-on-danger)', borderWidth: 1 }}
    >
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h2 className="h-card flex items-center gap-2">
          <AlertTriangle size={16} className="text-on-danger" />
          {t('monitoring:risk.title')} <span className="text-xs font-normal text-muted">{t('monitoring:risk.allProjects')}</span>
        </h2>
        <div className="flex items-center gap-2.5">
          {overdueWbs.length > 0 && <CountChip tone="danger" label={t('monitoring:risk.chipOverdue')} count={overdueWbs.length} />}
          {dueSoonWbs.length > 0 && <CountChip tone="warning" label={t('monitoring:risk.chipDueSoon')} count={dueSoonWbs.length} />}
          {highOpenIssues.length > 0 && <CountChip tone="warning" label={t('monitoring:risk.chipHighIssue')} count={highOpenIssues.length} />}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Column title={t('monitoring:risk.colOverdue')} count={overdueWbs.length} tone="danger" icon={<Clock size={12} />} empty={t('monitoring:risk.colOverdueEmpty')}>
          {overdueWbs.slice(0, MAX_ROWS).map((it) => itemRow(it, 'danger'))}
          {overdueWbs.length > MAX_ROWS && <MoreText count={overdueWbs.length - MAX_ROWS} />}
        </Column>
        <Column title={t('monitoring:risk.colDueSoon')} count={dueSoonWbs.length} tone="warning" icon={<CalendarClock size={12} />} empty={t('monitoring:risk.colDueSoonEmpty')}>
          {dueSoonWbs.slice(0, MAX_ROWS).map((it) => itemRow(it, 'warning'))}
          {dueSoonWbs.length > MAX_ROWS && <MoreText count={dueSoonWbs.length - MAX_ROWS} />}
        </Column>
        <Column title={t('monitoring:risk.colHighIssue')} count={highOpenIssues.length} tone="warning" icon={<AlertTriangle size={12} />} empty={t('monitoring:risk.colHighIssueEmpty')}>
          {highOpenIssues.slice(0, MAX_ROWS).map((it) => itemRow(it, 'warning'))}
          {highOpenIssues.length > MAX_ROWS && <MoreText count={highOpenIssues.length - MAX_ROWS} />}
        </Column>
      </div>
    </Card>
  );
}

function CountChip({ tone, label, count }: { tone: 'danger' | 'warning'; label: string; count: number }) {
  const toneClass = tone === 'danger' ? 'text-on-danger' : 'text-on-warning';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${toneClass}`}>
      <span className="tabular-nums">{count}</span>
      <span className="font-normal text-muted">{label}</span>
    </span>
  );
}

function MoreText({ count }: { count: number }) {
  const { t } = useTranslation();
  return <p className="text-xs text-muted mt-1">{t('monitoring:more', { count })}</p>;
}

function Column({
  title, count, tone, icon, empty, children,
}: {
  title: string;
  count: number;
  tone: 'danger' | 'warning';
  icon: React.ReactNode;
  empty: string;
  children: React.ReactNode;
}) {
  const toneClass = tone === 'danger' ? 'text-on-danger' : 'text-on-warning';
  return (
    <div>
      <p className={`text-xs font-medium mb-2 flex items-center gap-1 ${toneClass}`}>
        {icon}
        {title} ({count})
      </p>
      {count === 0 ? <p className="text-xs text-muted italic">{empty}</p> : <div className="space-y-0">{children}</div>}
    </div>
  );
}
