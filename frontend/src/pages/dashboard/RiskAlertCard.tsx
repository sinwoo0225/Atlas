import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Clock, CalendarClock } from 'lucide-react';
import { Card } from '../../components/ui';
import type { RiskSignals, WbsItem, Issue } from '../../types';

const MAX_ROWS = 5;

interface Props {
  signals: RiskSignals;
  projectId: number;
}

// D-4 부하 인사이트: 헤더 카드 아래·grid 위 위험 신호 알림.
// 0 건이면 카드 자체 미노출 (시각 노이즈 방지).
// 라운드 2: border-on-danger + bg-danger-soft 로 강조 강화, 헤더에 인라인 카운트 칩.
export function RiskAlertCard({ signals, projectId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { overdueWbs, dueSoonWbs, highPriorityOpenIssues } = signals;
  if (overdueWbs.length + dueSoonWbs.length + highPriorityOpenIssues.length === 0) return null;

  const wbsRow = (w: WbsItem, tone: 'danger' | 'warning') => (
    <button
      key={w.id}
      type="button"
      onClick={() => navigate(`/projects/${projectId}/wbs?highlight=${w.id}`)}
      className="w-full text-left flex items-center justify-between gap-2 py-1 px-2 -mx-2 rounded hover:bg-surface-2 transition-colors"
    >
      <span className="text-sm text-secondary truncate flex-1 min-w-0">{w.name}</span>
      <span className={`text-xs shrink-0 ${tone === 'danger' ? 'text-on-danger' : 'text-on-warning'}`}>
        {w.endDate?.slice(0, 10)}
      </span>
    </button>
  );

  const issueRow = (i: Issue) => (
    <button
      key={i.id}
      type="button"
      onClick={() => navigate(`/projects/${projectId}/issues?highlight=${i.id}`)}
      className="w-full text-left flex items-center justify-between gap-2 py-1 px-2 -mx-2 rounded hover:bg-surface-2 transition-colors"
    >
      <span className="text-sm text-secondary truncate flex-1 min-w-0">{i.title}</span>
      {i.dueDate && <span className="text-xs text-on-warning shrink-0">{i.dueDate.slice(0, 10)}</span>}
    </button>
  );

  const moreLink = (count: number, target: string) => (
    <button
      type="button"
      onClick={() => navigate(target)}
      className="text-xs text-muted hover:text-accent mt-1 transition-colors"
    >
      {t('monitoring:risk.moreLink', { count })}
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
          {t('monitoring:risk.title')}
        </h2>
        <div className="flex items-center gap-1.5">
          {overdueWbs.length > 0 && <CountChip tone="danger" label={t('monitoring:risk.chipOverdue')} count={overdueWbs.length} />}
          {dueSoonWbs.length > 0 && <CountChip tone="warning" label={t('monitoring:risk.chipDueSoon')} count={dueSoonWbs.length} />}
          {highPriorityOpenIssues.length > 0 && <CountChip tone="warning" label={t('monitoring:risk.chipHighIssue')} count={highPriorityOpenIssues.length} />}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Column
          title={t('monitoring:risk.colOverdue')}
          count={overdueWbs.length}
          tone="danger"
          icon={<Clock size={12} />}
          empty={t('monitoring:risk.colOverdueEmpty')}
        >
          {overdueWbs.slice(0, MAX_ROWS).map((w) => wbsRow(w, 'danger'))}
          {overdueWbs.length > MAX_ROWS && moreLink(overdueWbs.length - MAX_ROWS, `/projects/${projectId}/wbs`)}
        </Column>
        <Column
          title={t('monitoring:risk.colDueSoon')}
          count={dueSoonWbs.length}
          tone="warning"
          icon={<CalendarClock size={12} />}
          empty={t('monitoring:risk.colDueSoonEmpty')}
        >
          {dueSoonWbs.slice(0, MAX_ROWS).map((w) => wbsRow(w, 'warning'))}
          {dueSoonWbs.length > MAX_ROWS && moreLink(dueSoonWbs.length - MAX_ROWS, `/projects/${projectId}/wbs`)}
        </Column>
        <Column
          title={t('monitoring:risk.colHighIssue')}
          count={highPriorityOpenIssues.length}
          tone="warning"
          icon={<AlertTriangle size={12} />}
          empty={t('monitoring:risk.colHighIssueEmpty')}
        >
          {highPriorityOpenIssues.slice(0, MAX_ROWS).map((i) => issueRow(i))}
          {highPriorityOpenIssues.length > MAX_ROWS &&
            moreLink(highPriorityOpenIssues.length - MAX_ROWS, `/projects/${projectId}/issues`)}
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

function Column({
  title,
  count,
  tone,
  icon,
  empty,
  children,
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
      {count === 0 ? (
        <p className="text-xs text-muted italic">{empty}</p>
      ) : (
        <div className="space-y-0">{children}</div>
      )}
    </div>
  );
}
