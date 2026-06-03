/* eslint-disable @typescript-eslint/no-explicit-any */
// ECharts tooltip 이 복잡한 union 타입을 받아 이 파일 안에서만 any 허용 (MonitoringChartGrid 와 같은 관행).
import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { TrendingUp, GitCompareArrows, Timer, Activity, FlaskConical, Layers, Dices, CalendarClock, Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card, Skeleton, EmptyState } from '../../components/ui';
import { getChartColors, useThemeMode } from '../../utils/themeColors';
import type {
  CycleTime, IssueFlowWeek, ActivityTrendDay, MonitoringTrends, ThroughputWeek,
  ForecastBundle, CfdPoint, MonteCarlo, ProjectForecast, DepartmentRollup,
} from '../../types';

const H = 280;
type Ch = ReturnType<typeof getChartColors>;

function shortMd(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// '추세' 탭 — ActivityLog 상태전이 재구성 기반 흐름 지표 (Vacanti Flow Metrics).
// 완료 시점은 Status→완료 전이, 전이기록 없는 과거 항목은 UpdatedAt 근사(사이클타임 캡션에 표기).
// 하단 '실험(Phase 3)' = 예측·고급(CFD/Monte Carlo/예상완료/부서) — 데이터 쌓일수록 의미.
export function TrendsTab({
  data, loading, forecast, forecastLoading,
}: {
  data: MonitoringTrends | null;
  loading: boolean;
  forecast: ForecastBundle | null;
  forecastLoading: boolean;
}) {
  const { t } = useTranslation();
  const theme = useThemeMode();
  // option 들을 메모이즈 — forecast 번들 도착 등 무관한 리렌더에서 같은 참조를 넘겨 재그리기 방지.
  const ch = useMemo(() => getChartColors(theme), [theme]);
  const throughputOpt = useMemo(() => (data ? throughputOption(data.throughput, ch, t) : null), [data, ch, t]);
  const issueFlowOpt = useMemo(() => (data ? issueFlowOption(data.issueFlow, ch, t) : null), [data, ch, t]);
  const cycleTimeOpt = useMemo(() => (data ? cycleTimeOption(data.cycleTime, ch, t) : null), [data, ch, t]);
  const activityTrendOpt = useMemo(() => (data ? activityTrendOption(data.activityTrend, ch) : null), [data, ch]);
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          icon={<TrendingUp size={16} />}
          title={t('monitoring:trends.throughputTitle')}
          subtitle={t('monitoring:trends.throughputSub')}
          desc={t('monitoring:trends.throughputDesc')}
        >
          {chartBody(loading, !!data && data.throughput.length > 0, () => <ReactECharts option={throughputOpt!} style={{ height: H }} />, t)}
        </ChartCard>

        <ChartCard
          icon={<GitCompareArrows size={16} />}
          title={t('monitoring:trends.issueFlowTitle')}
          subtitle={t('monitoring:trends.issueFlowSub')}
          desc={t('monitoring:trends.issueFlowDesc')}
        >
          {chartBody(loading, !!data && data.issueFlow.length > 0, () => <ReactECharts option={issueFlowOpt!} style={{ height: H }} />, t)}
        </ChartCard>

        <ChartCard
          icon={<Timer size={16} />}
          title={t('monitoring:trends.cycleTitle')}
          subtitle={data ? `${t('monitoring:trends.cyclePercentile')}${data.cycleTime.approxCount > 0 ? t('monitoring:trends.cycleApprox', { count: data.cycleTime.approxCount }) : ''}` : ''}
          desc={t('monitoring:trends.cycleDesc')}
        >
          {chartBody(loading, !!data && data.cycleTime.points.length > 0, () => <ReactECharts option={cycleTimeOpt!} style={{ height: H }} />, t)}
        </ChartCard>

        <ChartCard
          icon={<Activity size={16} />}
          title={t('monitoring:trends.activityTitle')}
          subtitle={t('monitoring:trends.activitySub')}
          desc={t('monitoring:trends.activityDesc')}
        >
          {chartBody(loading, !!data && data.activityTrend.length > 0, () => <ReactECharts option={activityTrendOpt!} style={{ height: H }} />, t)}
        </ChartCard>
      </section>

      <ExperimentalSection forecast={forecast} loading={forecastLoading} ch={ch} />
    </div>
  );
}

// 실험(Phase 3) — 예측·고급. 데이터(완료 전이·표본) 누적될수록 정확. 상단 추세와 구분선·배지로 분리.
function ExperimentalSection({ forecast, loading, ch }: { forecast: ForecastBundle | null; loading: boolean; ch: Ch }) {
  const { t } = useTranslation();
  // 예측 차트 option 메모이즈 — ch(상위에서 메모됨)와 forecast 가 같으면 동일 참조 유지.
  const cfdOpt = useMemo(() => (forecast ? cfdOption(forecast.cfd, ch, t) : null), [forecast, ch, t]);
  const monteCarloOpt = useMemo(() => (forecast ? monteCarloOption(forecast.monteCarlo, ch, t) : null), [forecast, ch, t]);
  const projectForecastOpt = useMemo(() => (forecast ? projectForecastOption(forecast.projectForecasts, ch, t) : null), [forecast, ch, t]);
  const departmentOpt = useMemo(() => (forecast ? departmentOption(forecast.departmentRollup, ch, t) : null), [forecast, ch, t]);
  return (
    <div className="pt-4 border-t border-default">
      <div className="flex items-center gap-2 mb-3">
        <FlaskConical size={15} className="text-accent" />
        <h2 className="h-section">{t('monitoring:trends.expTitle')}</h2>
        <span className="text-[11px] text-muted">{t('monitoring:trends.expNote')}</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          icon={<Layers size={16} />}
          title={t('monitoring:trends.cfdTitle')}
          subtitle={t('monitoring:trends.cfdSub')}
          desc={t('monitoring:trends.cfdDesc')}
        >
          {chartBody(loading, !!forecast && forecast.cfd.length > 0, () => <ReactECharts option={cfdOpt!} style={{ height: H }} />, t)}
        </ChartCard>

        <ChartCard
          icon={<Dices size={16} />}
          title={t('monitoring:trends.mcTitle')}
          subtitle={monteCarloSubtitle(forecast, t)}
          desc={t('monitoring:trends.mcDesc')}
        >
          {chartBody(loading, !!forecast && forecast.monteCarlo.sufficient, () => <ReactECharts option={monteCarloOpt!} style={{ height: H }} />, t, t('monitoring:trends.mcEmpty'))}
        </ChartCard>

        <ChartCard
          icon={<CalendarClock size={16} />}
          title={t('monitoring:trends.pfTitle')}
          subtitle={t('monitoring:trends.pfSub')}
          desc={t('monitoring:trends.pfDesc')}
        >
          {chartBody(loading, !!forecast && forecast.projectForecasts.length > 0, () => <ReactECharts option={projectForecastOpt!} style={{ height: H }} />, t, t('monitoring:trends.pfEmpty'))}
        </ChartCard>

        <ChartCard
          icon={<Building2 size={16} />}
          title={t('monitoring:trends.deptTitle')}
          subtitle={t('monitoring:trends.deptSub')}
          desc={t('monitoring:trends.deptDesc')}
        >
          {chartBody(loading, !!forecast && forecast.departmentRollup.length > 0, () => <ReactECharts option={departmentOpt!} style={{ height: H }} />, t, t('monitoring:trends.deptEmpty'))}
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ icon, title, subtitle, desc, children, wide }: { icon: React.ReactNode; title: string; subtitle: string; desc?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <Card padding="normal" className={wide ? 'lg:col-span-2' : undefined}>
      <h3 className="h-card flex items-center gap-2 mb-1">
        <span className="text-muted">{icon}</span>
        {title} <span className="text-xs font-normal text-muted">{subtitle}</span>
      </h3>
      {desc && <p className="text-[11px] text-muted leading-snug mb-2">{desc}</p>}
      <div style={{ height: H }}>{children}</div>
    </Card>
  );
}

function chartBody(loading: boolean, hasData: boolean, render: () => React.ReactNode, t: TFunction, emptyMsg?: string) {
  if (loading) return <Skeleton height={H} />;
  if (!hasData) return <div className="h-full flex items-center justify-center"><EmptyState icon={<TrendingUp size={28} />} title={t('monitoring:trends.noData')} description={emptyMsg ?? t('monitoring:trends.emptyDefault')} /></div>;
  return render();
}

function monteCarloSubtitle(forecast: ForecastBundle | null, t: TFunction): string {
  if (!forecast || !forecast.monteCarlo.sufficient) return t('monitoring:trends.mcSubInsufficient');
  const mc = forecast.monteCarlo;
  return t('monitoring:trends.mcSub', { remaining: mc.remaining, p50: mc.p50Date ?? '-', p85: mc.p85Date ?? '-' });
}

function baseAxis(ch: Ch) {
  return {
    axisLine: { lineStyle: { color: ch.axisLine } },
    axisLabel: { color: ch.axisText, fontSize: 9 },
    splitLine: { lineStyle: { color: ch.splitLine } },
  };
}
function tip(ch: Ch) {
  return { backgroundColor: ch.tooltipBg, borderColor: ch.tooltipBorder, textStyle: { color: ch.tooltipText } };
}

function throughputOption(weeks: ThroughputWeek[], ch: Ch, t: TFunction) {
  const labels = weeks.map((w) => shortMd(w.weekStart));
  const issueLabel = t('monitoring:trends.legendIssue');
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...tip(ch) },
    legend: { data: ['WBS', issueLabel], textStyle: { color: ch.axisText, fontSize: 10 }, top: 0, right: 0 },
    grid: { left: 36, right: 12, top: 24, bottom: 22 },
    xAxis: { type: 'category', data: labels, ...baseAxis(ch) },
    yAxis: { type: 'value', minInterval: 1, ...baseAxis(ch) },
    series: [
      { name: 'WBS', type: 'bar', stack: 'done', data: weeks.map((w) => w.wbs), itemStyle: { color: ch.ganttBarDone } },
      { name: issueLabel, type: 'bar', stack: 'done', data: weeks.map((w) => w.issue), itemStyle: { color: ch.accentBar, borderRadius: [3, 3, 0, 0] } },
    ],
  };
}

function issueFlowOption(weeks: IssueFlowWeek[], ch: Ch, t: TFunction) {
  const labels = weeks.map((w) => shortMd(w.weekStart));
  let co = 0; const cumO = weeks.map((w) => (co += w.opened));
  let cr = 0; const cumR = weeks.map((w) => (cr += w.resolved));
  const openedLabel = t('monitoring:trends.flowOpened');
  const resolvedLabel = t('monitoring:trends.flowResolved');
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', ...tip(ch) },
    legend: { data: [openedLabel, resolvedLabel], textStyle: { color: ch.axisText, fontSize: 10 }, top: 0, right: 0 },
    grid: { left: 36, right: 12, top: 24, bottom: 22 },
    xAxis: { type: 'category', data: labels, ...baseAxis(ch) },
    yAxis: { type: 'value', ...baseAxis(ch) },
    series: [
      { name: openedLabel, type: 'line', smooth: true, symbol: 'none', data: cumO, lineStyle: { color: ch.ganttToday, width: 2 }, areaStyle: { color: ch.ganttToday, opacity: 0.08 } },
      { name: resolvedLabel, type: 'line', smooth: true, symbol: 'none', data: cumR, lineStyle: { color: ch.ganttBarDone, width: 2 }, areaStyle: { color: ch.ganttBarDone, opacity: 0.08 } },
    ],
  };
}

function cycleTimeOption(ct: CycleTime, ch: Ch, t: TFunction) {
  const pts = ct.points.map((p, i) => [i, p.days, p.kind, p.title] as [number, number, string, string]);
  return {
    backgroundColor: 'transparent',
    tooltip: {
      ...tip(ch),
      formatter: (p: any) => {
        const v = p.value as [number, number, string, string];
        return `${v[3]}<br/>${t('monitoring:trends.cyclePoint', { kind: v[2] === 'wbs' ? 'WBS' : 'Issue', days: v[1] })}`;
      },
    },
    grid: { left: 40, right: 14, top: 28, bottom: 22 },
    xAxis: { type: 'value', name: t('monitoring:trends.cycleXAxis'), nameTextStyle: { color: ch.axisText, fontSize: 9 }, ...baseAxis(ch), splitLine: { show: false } },
    yAxis: { type: 'value', name: t('monitoring:trends.cycleYAxis'), nameTextStyle: { color: ch.axisText, fontSize: 9 }, ...baseAxis(ch) },
    series: [{
      type: 'scatter', symbolSize: 8, data: pts,
      itemStyle: { color: ch.accentBar, opacity: 0.75 },
      markLine: {
        symbol: 'none', label: { fontSize: 9, position: 'insideEndTop' },
        data: [
          { yAxis: ct.p50, lineStyle: { color: ch.ganttBarDone, type: 'dashed' }, label: { formatter: t('monitoring:trends.cycleP50', { days: ct.p50 }), color: ch.ganttBarDone } },
          { yAxis: ct.p85, lineStyle: { color: ch.ganttBarInProgress, type: 'dashed' }, label: { formatter: t('monitoring:trends.cycleP85', { days: ct.p85 }), color: ch.ganttBarInProgress } },
          { yAxis: ct.p95, lineStyle: { color: ch.ganttToday, type: 'dashed' }, label: { formatter: t('monitoring:trends.cycleP95', { days: ct.p95 }), color: ch.ganttToday } },
        ],
      },
    }],
  };
}

function activityTrendOption(days: ActivityTrendDay[], ch: Ch) {
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', ...tip(ch) },
    grid: { left: 32, right: 12, top: 12, bottom: 22 },
    xAxis: { type: 'category', data: days.map((d) => shortMd(d.date)), ...baseAxis(ch), axisLabel: { color: ch.axisText, fontSize: 8, interval: Math.floor(days.length / 10) } },
    yAxis: { type: 'value', minInterval: 1, ...baseAxis(ch) },
    series: [{ type: 'line', smooth: true, symbol: 'none', data: days.map((d) => d.count), lineStyle: { color: ch.accentBar, width: 2 }, areaStyle: { color: ch.accentBar, opacity: 0.1 } }],
  };
}

// ===== Phase 3 (실험) 차트 옵션 =====

function cfdOption(cfd: CfdPoint[], ch: Ch, t: TFunction) {
  const stack = (name: string, data: number[], color: string, op: number) => ({
    name, type: 'line', stack: 'cfd', smooth: true, symbol: 'none',
    lineStyle: { width: 0 }, areaStyle: { color, opacity: op }, emphasis: { focus: 'series' }, data,
  });
  const plannedLabel = t('monitoring:trends.cfdPlanned');
  const inProgressLabel = t('monitoring:trends.cfdInProgress');
  const doneLabel = t('monitoring:trends.cfdDone');
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', ...tip(ch) },
    legend: { data: [plannedLabel, inProgressLabel, doneLabel], textStyle: { color: ch.axisText, fontSize: 10 }, top: 0, right: 0 },
    grid: { left: 36, right: 12, top: 24, bottom: 22 },
    xAxis: { type: 'category', boundaryGap: false, data: cfd.map((p) => shortMd(p.date)), ...baseAxis(ch), axisLabel: { color: ch.axisText, fontSize: 8, interval: Math.max(0, Math.floor(cfd.length / 10)) } },
    yAxis: { type: 'value', minInterval: 1, ...baseAxis(ch) },
    series: [
      stack(plannedLabel, cfd.map((p) => p.planned), ch.mutedBar, 0.5),
      stack(inProgressLabel, cfd.map((p) => p.inProgress), ch.ganttBarInProgress, 0.55),
      stack(doneLabel, cfd.map((p) => p.done), ch.ganttBarDone, 0.55),
    ],
  };
}

function monteCarloOption(mc: MonteCarlo, ch: Ch, t: TFunction) {
  const idx = (w: number) => mc.histogram.findIndex((b) => b.weeks === w);
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', ...tip(ch), formatter: (ps: any) => { const b = mc.histogram[ps[0].dataIndex as number]; return t('monitoring:trends.mcTooltip', { weeks: b.weeks, count: b.count }); } },
    grid: { left: 40, right: 14, top: 14, bottom: 22 },
    xAxis: { type: 'category', data: mc.histogram.map((b) => t('monitoring:trends.weeksLabel', { weeks: b.weeks })), ...baseAxis(ch) },
    yAxis: { type: 'value', name: t('monitoring:trends.mcFreq'), nameTextStyle: { color: ch.axisText, fontSize: 9 }, ...baseAxis(ch) },
    series: [{
      type: 'bar', barWidth: '60%',
      data: mc.histogram.map((b) => ({ value: b.count, itemStyle: { color: b.weeks <= mc.p50Weeks ? ch.ganttBarDone : (b.weeks <= mc.p85Weeks ? ch.ganttBarInProgress : ch.mutedBar), borderRadius: [3, 3, 0, 0] } })),
      markLine: {
        symbol: 'none', label: { fontSize: 9 },
        data: [
          ...(idx(mc.p50Weeks) >= 0 ? [{ xAxis: idx(mc.p50Weeks), lineStyle: { color: ch.ganttBarDone }, label: { formatter: t('monitoring:trends.mcP50', { weeks: mc.p50Weeks }), color: ch.ganttBarDone } }] : []),
          ...(idx(mc.p85Weeks) >= 0 ? [{ xAxis: idx(mc.p85Weeks), lineStyle: { color: ch.ganttBarInProgress }, label: { formatter: t('monitoring:trends.mcP85', { weeks: mc.p85Weeks }), color: ch.ganttBarInProgress } }] : []),
        ],
      },
    }],
  };
}

function projectForecastOption(items: ProjectForecast[], ch: Ch, t: TFunction) {
  const top = items.slice(0, 12);
  const projectedLabel = t('monitoring:trends.pfProjected');
  const deadlineLabel = t('monitoring:trends.pfDeadline');
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, ...tip(ch),
      formatter: (ps: any) => { const f = top[ps[0].dataIndex as number]; return t('monitoring:trends.pfTooltip', { name: f.projectName, remaining: f.remaining, projected: f.projectedWeeks ?? t('monitoring:trends.pfUnknown'), deadline: f.weeksToDeadline ?? '-' }); },
    },
    legend: { data: [projectedLabel, deadlineLabel], textStyle: { color: ch.axisText, fontSize: 10 }, top: 0, right: 0 },
    grid: { left: 90, right: 24, top: 24, bottom: 20 },
    xAxis: { type: 'value', ...baseAxis(ch) },
    yAxis: { type: 'category', inverse: true, data: top.map((f) => f.projectName), axisLine: { lineStyle: { color: ch.axisLine } }, axisLabel: { color: ch.axisText, fontSize: 10, formatter: (v: string) => (v.length > 8 ? v.slice(0, 8) + '…' : v) } },
    series: [
      { name: projectedLabel, type: 'bar', barGap: '-30%', barWidth: 8, data: top.map((f) => ({ value: f.projectedWeeks, itemStyle: { color: f.atRisk ? ch.ganttToday : ch.ganttBarDone } })) },
      { name: deadlineLabel, type: 'bar', barWidth: 8, data: top.map((f) => f.weeksToDeadline), itemStyle: { color: ch.accentBar } },
    ],
  };
}

function departmentOption(items: DepartmentRollup[], ch: Ch, t: TFunction) {
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...tip(ch), formatter: (ps: any) => { const d = items[ps[0].dataIndex as number]; return t('monitoring:trends.deptTooltip', { dept: d.department, open: d.openItems, people: d.people }); } },
    grid: { left: 80, right: 28, top: 8, bottom: 20 },
    xAxis: { type: 'value', minInterval: 1, ...baseAxis(ch) },
    yAxis: { type: 'category', inverse: true, data: items.map((d) => d.department), axisLine: { lineStyle: { color: ch.axisLine } }, axisLabel: { color: ch.axisText, fontSize: 10 } },
    series: [{ type: 'bar', barWidth: 12, data: items.map((d) => d.openItems), itemStyle: { color: ch.accentBar, borderRadius: [0, 3, 3, 0] }, label: { show: true, position: 'right', color: ch.axisText, fontSize: 9 } }],
  };
}
