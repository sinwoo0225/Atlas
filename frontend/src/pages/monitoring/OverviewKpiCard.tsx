import { Gauge, FolderKanban, Loader, CheckCircle2, TrendingUp, AlertCircle, Diamond } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, Skeleton } from '../../components/ui';
import type { MonitoringCharts, OpenIssuesByProject } from '../../types';

const BODY_H = 280;

// 개요 요약 KPI — 이미 로드된 charts/openIssues 로 클라이언트 계산(추가 API 없음).
// Risk Radar(지연/임박 항목 리스트)와 중복되지 않는 총괄 숫자만.
export function OverviewKpiCard({
  charts, openIssues, loading,
}: {
  charts: MonitoringCharts | null;
  openIssues: OpenIssuesByProject[];
  loading: boolean;
}) {
  const { t } = useTranslation();
  const ps = charts?.projectStatus;
  const total = ps ? ps.planned + ps.waiting + ps.inProgress + ps.done : 0;
  const wbsProg = charts?.wbsProgress ?? [];
  const avgProgress = wbsProg.length
    ? Math.round(wbsProg.reduce((s, w) => s + w.progressPercent, 0) / wbsProg.length)
    : 0;
  const openIssueCount = openIssues.reduce((n, p) => n + p.issues.length, 0);

  const tiles: { icon: React.ReactNode; label: string; value: string; tone?: string }[] = [
    { icon: <FolderKanban size={15} />, label: t('monitoring:kpi.totalProjects'), value: String(total) },
    { icon: <Loader size={15} />, label: t('monitoring:kpi.inProgress'), value: String(ps?.inProgress ?? 0), tone: 'text-accent' },
    { icon: <CheckCircle2 size={15} />, label: t('monitoring:kpi.done'), value: String(ps?.done ?? 0) },
    { icon: <TrendingUp size={15} />, label: t('monitoring:kpi.avgWbsProgress'), value: `${avgProgress}%` },
    { icon: <AlertCircle size={15} />, label: t('monitoring:kpi.openIssues'), value: String(openIssueCount), tone: openIssueCount > 0 ? 'text-on-warning' : undefined },
    { icon: <Diamond size={15} />, label: t('monitoring:kpi.upcomingMilestones'), value: String(charts?.upcomingMilestones.length ?? 0) },
  ];

  return (
    <Card padding="normal">
      <h3 className="h-card flex items-center gap-2 mb-1">
        <Gauge size={16} className="text-muted" />
        {t('monitoring:kpi.title')}
      </h3>
      <div style={{ height: BODY_H }}>
        {loading || !charts ? (
          <Skeleton height={BODY_H} />
        ) : (
          <div className="grid grid-cols-2 gap-2 h-full">
            {tiles.map((tile) => (
              <div
                key={tile.label}
                className="flex flex-col justify-center rounded-md bg-surface-2 border border-default px-3 py-2"
              >
                <span className="text-[11px] text-muted flex items-center gap-1.5">
                  <span className="text-muted">{tile.icon}</span>
                  {tile.label}
                </span>
                <span className={`text-2xl font-bold tabular-nums leading-tight mt-0.5 ${tile.tone ?? 'text-primary'}`}>
                  {tile.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
