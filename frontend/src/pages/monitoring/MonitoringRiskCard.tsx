import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, CalendarClock } from 'lucide-react';
import { Card } from '../../components/ui';
import type { MonitoringRisk, RiskItem } from '../../types';

const MAX_ROWS = 6;

// 개요 상단 전역 Risk Radar — 전 프로젝트의 마감 초과/임박 WBS + High Open 이슈.
// 프로젝트 대시보드의 RiskAlertCard 를 across-project 로 각색. 0 건이면 미노출(시각 노이즈 방지).
export function MonitoringRiskCard({ risk }: { risk: MonitoringRisk | null }) {
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
          주의가 필요한 항목 <span className="text-xs font-normal text-muted">(전체 프로젝트)</span>
        </h2>
        <div className="flex items-center gap-2.5">
          {overdueWbs.length > 0 && <CountChip tone="danger" label="지연" count={overdueWbs.length} />}
          {dueSoonWbs.length > 0 && <CountChip tone="warning" label="임박" count={dueSoonWbs.length} />}
          {highOpenIssues.length > 0 && <CountChip tone="warning" label="High 이슈" count={highOpenIssues.length} />}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Column title="지연된 WBS" count={overdueWbs.length} tone="danger" icon={<Clock size={12} />} empty="지연 없음">
          {overdueWbs.slice(0, MAX_ROWS).map((it) => itemRow(it, 'danger'))}
          {overdueWbs.length > MAX_ROWS && <MoreText count={overdueWbs.length - MAX_ROWS} />}
        </Column>
        <Column title="마감 임박 (7일)" count={dueSoonWbs.length} tone="warning" icon={<CalendarClock size={12} />} empty="임박 없음">
          {dueSoonWbs.slice(0, MAX_ROWS).map((it) => itemRow(it, 'warning'))}
          {dueSoonWbs.length > MAX_ROWS && <MoreText count={dueSoonWbs.length - MAX_ROWS} />}
        </Column>
        <Column title="처리 안 된 High 이슈" count={highOpenIssues.length} tone="warning" icon={<AlertTriangle size={12} />} empty="High 이슈 없음">
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
  return <p className="text-xs text-muted mt-1">외 {count}건</p>;
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
