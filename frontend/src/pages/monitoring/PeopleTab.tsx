/* eslint-disable @typescript-eslint/no-explicit-any */
// ECharts tooltip/onEvents 가 복잡한 union 타입을 받아 이 파일 안에서만 any 허용
// (MonitoringChartGrid 와 같은 관행).
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { Users, Scale, ShieldAlert, UserPlus, Trophy, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card, Badge, Skeleton, EmptyState } from '../../components/ui';
import { getChartColors, useThemeMode, effectiveLightDark } from '../../utils/themeColors';
import { ResourceHeatmapCard } from './ResourceHeatmapCard';
import { CapacityHeatmapCard } from './CapacityHeatmapCard';
import type {
  AssigneeCycleTime, AssigneeThroughput, AssigneeWorkload, CapacityHeatmap, ResourceHeatmap, UnassignedItem, WorkloadOverview,
} from '../../types';

const CHART_HEIGHT = 280;

interface Props {
  workload: WorkloadOverview | null;
  heatmap: ResourceHeatmap | null;
  capacity: CapacityHeatmap | null;
  capacityLoading: boolean;
  loading: boolean;
  // Phase 2 (추세 번들 지연 로드) — 담당자별 처리량·사이클타임.
  assigneeThroughput: AssigneeThroughput | null;
  assigneeCycleTime: AssigneeCycleTime[];
  trendsLoading: boolean;
}

// '담당자' 탭 — 관리자 렌즈. 여러 담당자의 업무 부하·위험·미할당·처리량·사이클타임을 한 화면에.
// 귀속은 엔티티 Assignee/AssigneeResource(백엔드), Actor 아님.
export function PeopleTab({ workload, heatmap, capacity, capacityLoading, loading, assigneeThroughput, assigneeCycleTime, trendsLoading }: Props) {
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WorkloadBalanceCard data={workload?.assignees ?? []} loading={loading} />
        <PersonRiskCard data={workload?.assignees ?? []} loading={loading} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CapacityHeatmapCard data={capacity} loading={capacityLoading} height={CHART_HEIGHT} />
        <ResourceHeatmapCard data={heatmap} loading={loading} height={CHART_HEIGHT} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UnassignedQueueCard data={workload?.unassigned ?? []} loading={loading} />
        <PersonThroughputCard data={assigneeThroughput} loading={trendsLoading} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PersonCycleTimeCard data={assigneeCycleTime} loading={trendsLoading} />
      </div>
    </section>
  );
}

// 담당자별 워크로드 밸런스 — 미완 WBS + 이슈를 사람별 스택 가로막대로. 부하 합계순(과부하 상단).
function WorkloadBalanceCard({ data, loading }: { data: AssigneeWorkload[]; loading: boolean }) {
  const { t } = useTranslation();
  const theme = useThemeMode();
  // option 을 메모이즈 — 추세 번들 도착 등 무관한 부모 리렌더에서 같은 참조를 넘겨 재그리기 방지.
  const ch = useMemo(() => getChartColors(theme), [theme]);
  const option = useMemo(() => buildWorkloadOption(data.slice(0, 15), ch, t), [data, ch, t]);

  return (
    <Card padding="normal">
      <h3 className="h-card flex items-center gap-2 mb-1">
        <Scale size={16} className="text-muted" />
        {t('monitoring:people.workloadTitle')}
      </h3>
      {loading ? (
        <Skeleton height={CHART_HEIGHT} />
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: CHART_HEIGHT }}>
          <EmptyState icon={<Users size={28} />} title={t('monitoring:people.workloadEmpty')} />
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: CHART_HEIGHT }} />
      )}
    </Card>
  );
}

function buildWorkloadOption(items: AssigneeWorkload[], ch: ReturnType<typeof getChartColors>, t: TFunction) {
  const names = items.map((a) => a.assignee);
  const issueLabel = t('monitoring:people.legendIssue');
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      backgroundColor: ch.tooltipBg, borderColor: ch.tooltipBorder, textStyle: { color: ch.tooltipText },
    },
    legend: { data: ['WBS', issueLabel], textStyle: { color: ch.axisText, fontSize: 10 }, top: 0, right: 0 },
    grid: { left: 90, right: 32, top: 24, bottom: 22 },
    xAxis: {
      type: 'value', minInterval: 1,
      axisLabel: { color: ch.axisText, fontSize: 9 },
      splitLine: { lineStyle: { color: ch.splitLine } },
    },
    yAxis: {
      type: 'category', inverse: true, data: names,
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: { color: ch.axisText, fontSize: 10, formatter: (v: string) => (v.length > 8 ? v.slice(0, 8) + '…' : v) },
    },
    series: [
      { name: 'WBS', type: 'bar', stack: 'load', barWidth: 12, data: items.map((a) => a.openWbs), itemStyle: { color: ch.accentBar } },
      {
        name: issueLabel, type: 'bar', stack: 'load', barWidth: 12, data: items.map((a) => a.openIssues),
        itemStyle: { color: ch.ganttMilestone, borderRadius: [0, 3, 3, 0] },
        label: {
          show: true, position: 'right', color: ch.axisText, fontSize: 9,
          formatter: (p: any) => { const a = items[p.dataIndex as number]; return String(a.openWbs + a.openIssues); },
        },
      },
    ],
  };
}

// 담당자별 위험 매트릭스 — 사람 × {마감초과·임박·High Open}. 위험 0인 담당자는 제외.
function PersonRiskCard({ data, loading }: { data: AssigneeWorkload[]; loading: boolean }) {
  const { t } = useTranslation();
  const theme = useThemeMode();
  const ch = useMemo(() => getChartColors(theme), [theme]);
  const ld = effectiveLightDark(theme);
  const atRisk = useMemo(() => data.filter((a) => a.overdue + a.dueSoon + a.highOpen > 0).slice(0, 15), [data]);
  const option = useMemo(() => buildPersonRiskOption(atRisk, ch, ld, t), [atRisk, ch, ld, t]);

  return (
    <Card padding="normal">
      <h3 className="h-card flex items-center gap-2 mb-1">
        <ShieldAlert size={16} className="text-muted" />
        {t('monitoring:people.riskTitle')}
      </h3>
      {loading ? (
        <Skeleton height={CHART_HEIGHT} />
      ) : atRisk.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: CHART_HEIGHT }}>
          <EmptyState icon={<ShieldAlert size={28} />} title={t('monitoring:people.riskEmpty')} description={t('monitoring:people.riskEmptyDesc')} />
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: CHART_HEIGHT }} />
      )}
    </Card>
  );
}

function buildPersonRiskOption(items: AssigneeWorkload[], ch: ReturnType<typeof getChartColors>, theme: 'dark' | 'light', t: TFunction) {
  const cols = [t('monitoring:people.riskColOverdue'), t('monitoring:people.riskColDueSoon'), t('monitoring:people.riskColHigh')];
  const names = items.map((a) => a.assignee);
  const points: [number, number, number][] = [];
  let max = 0;
  items.forEach((a, ri) => {
    const vals = [a.overdue, a.dueSoon, a.highOpen];
    vals.forEach((v, ci) => { if (v > max) max = v; points.push([ci, ri, v]); });
  });
  return {
    backgroundColor: 'transparent',
    tooltip: {
      position: 'top',
      formatter: (p: any) => {
        const [ci, ri, v] = p.value as [number, number, number];
        return t('monitoring:people.riskTooltip', { name: names[ri], col: cols[ci], count: v });
      },
      backgroundColor: ch.tooltipBg, borderColor: ch.tooltipBorder, textStyle: { color: ch.tooltipText },
    },
    grid: { left: 70, right: 12, top: 8, bottom: 24 },
    xAxis: {
      type: 'category', data: cols,
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: { color: ch.axisText, fontSize: 10 },
      splitArea: { show: true },
    },
    yAxis: {
      type: 'category', inverse: true, data: names,
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: { color: ch.axisText, fontSize: 10, formatter: (v: string) => (v.length > 7 ? v.slice(0, 7) + '…' : v) },
      splitArea: { show: true },
    },
    visualMap: {
      show: false, min: 0, max: Math.max(max, 1),
      inRange: { color: theme === 'light' ? ['#f0ebe0', '#b91c1c'] : ['#2a2f3a', '#f87171'] },
    },
    series: [{
      type: 'heatmap', data: points,
      label: { show: true, color: ch.tooltipText, fontSize: 11, formatter: (p: any) => { const v = (p.value as number[])[2]; return v > 0 ? String(v) : ''; } },
      itemStyle: { borderColor: ch.splitLine, borderWidth: 1 },
      emphasis: { itemStyle: { shadowBlur: 8 } },
    }],
  };
}

// 미할당 작업 큐 — 담당자 미지정 미완 항목(마감 임박순). 관리자 배정 액션 아이템.
function UnassignedQueueCard({ data, loading }: { data: UnassignedItem[]; loading: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Card padding="normal">
      <h3 className="h-card flex items-center gap-2 mb-2">
        <UserPlus size={16} className="text-muted" />
        {t('monitoring:people.unassignedTitle')}
        {data.length > 0 && <span className="text-xs font-normal text-muted">({data.length})</span>}
      </h3>
      <div style={{ height: CHART_HEIGHT }}>
      {loading ? (
        <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={40} />)}</div>
      ) : data.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <EmptyState icon={<UserPlus size={28} />} title={t('monitoring:people.unassignedEmpty')} description={t('monitoring:people.unassignedEmptyDesc')} />
        </div>
      ) : (
        <ul className="h-full space-y-2 overflow-y-auto pr-1">
          {data.map((it) => (
            <li key={`${it.kind}-${it.id}`}>
              <button
                type="button"
                onClick={() => navigate(it.kind === 'wbs'
                  ? `/projects/${it.projectId}/wbs?highlight=${it.id}`
                  : `/projects/${it.projectId}/issues?highlight=${it.id}`)}
                className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-md bg-surface-2 border border-default hover:bg-surface-3 transition-colors"
              >
                <Badge variant={it.kind === 'wbs' ? 'info' : 'warning'} size="sm">{it.kind === 'wbs' ? 'WBS' : 'Issue'}</Badge>
                <span className="text-sm text-primary truncate flex-1 min-w-0">{it.title}</span>
                <span className="text-[11px] text-muted shrink-0 truncate max-w-[30%] hidden sm:inline">{it.projectName}</span>
                {it.dueDate && <span className="text-xs text-on-warning shrink-0">{it.dueDate}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      </div>
    </Card>
  );
}

// 담당자별 처리량(B-3) — 완료 엔티티의 Assignee 귀속(Actor 아님). 최근 N주 합계 가로막대.
function PersonThroughputCard({ data, loading }: { data: AssigneeThroughput | null; loading: boolean }) {
  const { t } = useTranslation();
  const theme = useThemeMode();
  const ch = useMemo(() => getChartColors(theme), [theme]);
  const rows = useMemo(() => (data?.rows ?? []).slice(0, 15), [data]);
  const weeks = data?.weekStarts.length ?? 0;
  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: ch.tooltipBg, borderColor: ch.tooltipBorder, textStyle: { color: ch.tooltipText } },
    grid: { left: 90, right: 32, top: 8, bottom: 20 },
    xAxis: { type: 'value', minInterval: 1, axisLabel: { color: ch.axisText, fontSize: 9 }, splitLine: { lineStyle: { color: ch.splitLine } } },
    yAxis: {
      type: 'category', inverse: true, data: rows.map((r) => r.assignee),
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: { color: ch.axisText, fontSize: 10, formatter: (v: string) => (v.length > 8 ? v.slice(0, 8) + '…' : v) },
    },
    series: [{
      type: 'bar', barWidth: 12, data: rows.map((r) => r.total),
      itemStyle: { color: ch.ganttBarDone, borderRadius: [0, 3, 3, 0] },
      label: { show: true, position: 'right', color: ch.axisText, fontSize: 9 },
    }],
  }), [rows, ch]);
  return (
    <Card padding="normal">
      <h3 className="h-card flex items-center gap-2 mb-1">
        <Trophy size={16} className="text-muted" />
        {t('monitoring:people.throughputTitle')} <span className="text-xs font-normal text-muted">{t('monitoring:people.throughputSub', { weeks })}</span>
      </h3>
      <div style={{ height: CHART_HEIGHT }}>
        {loading ? (
          <Skeleton height={CHART_HEIGHT} />
        ) : rows.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <EmptyState icon={<Trophy size={28} />} title={t('monitoring:people.noCompleted')} description={t('monitoring:people.noCompletedDesc')} />
          </div>
        ) : (
          <ReactECharts option={option} style={{ height: CHART_HEIGHT }} />
        )}
      </div>
    </Card>
  );
}

// 담당자별 사이클타임(B-4) — 완료시점−생성 중앙값·85p. 표본 적으면 참고용.
function PersonCycleTimeCard({ data, loading }: { data: AssigneeCycleTime[]; loading: boolean }) {
  const { t } = useTranslation();
  const theme = useThemeMode();
  const ch = useMemo(() => getChartColors(theme), [theme]);
  const rows = useMemo(() => data.slice(0, 15), [data]);
  const option = useMemo(() => {
    const medianLabel = t('monitoring:people.legendMedian');
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis', backgroundColor: ch.tooltipBg, borderColor: ch.tooltipBorder, textStyle: { color: ch.tooltipText },
        formatter: (ps: any) => { const i = ps[0].dataIndex as number; const r = rows[i]; return t('monitoring:people.cycleTooltip', { name: r.assignee, count: r.count, median: r.median, p85: r.p85 }); },
      },
      legend: { data: [medianLabel, '85p'], textStyle: { color: ch.axisText, fontSize: 10 }, top: 0, right: 0 },
      grid: { left: 90, right: 24, top: 24, bottom: 20 },
      xAxis: { type: 'value', name: t('monitoring:people.axisDays'), nameTextStyle: { color: ch.axisText, fontSize: 9 }, axisLabel: { color: ch.axisText, fontSize: 9 }, splitLine: { lineStyle: { color: ch.splitLine } } },
      yAxis: {
        type: 'category', inverse: true, data: rows.map((r) => r.assignee),
        axisLine: { lineStyle: { color: ch.axisLine } },
        axisLabel: { color: ch.axisText, fontSize: 10, formatter: (v: string) => (v.length > 8 ? v.slice(0, 8) + '…' : v) },
      },
      series: [
        { name: medianLabel, type: 'bar', barGap: '-30%', barWidth: 8, data: rows.map((r) => r.median), itemStyle: { color: ch.ganttBarDone, borderRadius: [0, 3, 3, 0] } },
        { name: '85p', type: 'bar', barWidth: 8, data: rows.map((r) => r.p85), itemStyle: { color: ch.ganttBarInProgress, borderRadius: [0, 3, 3, 0] } },
      ],
    };
  }, [rows, ch, t]);
  return (
    <Card padding="normal">
      <h3 className="h-card flex items-center gap-2 mb-1">
        <Timer size={16} className="text-muted" />
        {t('monitoring:people.cycleTitle')} <span className="text-xs font-normal text-muted">{t('monitoring:people.cycleSub')}</span>
      </h3>
      <div style={{ height: CHART_HEIGHT }}>
        {loading ? (
          <Skeleton height={CHART_HEIGHT} />
        ) : rows.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <EmptyState icon={<Timer size={28} />} title={t('monitoring:people.noCompleted')} />
          </div>
        ) : (
          <ReactECharts option={option} style={{ height: CHART_HEIGHT }} />
        )}
      </div>
    </Card>
  );
}
