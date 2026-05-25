/* eslint-disable @typescript-eslint/no-explicit-any */
// ECharts tooltip 이 복잡한 union 타입을 받아 이 파일 안에서만 any 허용 (MonitoringChartGrid 와 같은 관행).
import ReactECharts from 'echarts-for-react';
import { TrendingUp, GitCompareArrows, Timer, Activity, FlaskConical, Layers, Dices, CalendarClock, Building2 } from 'lucide-react';
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
  const theme = useThemeMode();
  const ch = getChartColors(theme);
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard icon={<TrendingUp size={16} />} title="주간 처리량" subtitle="완료(WBS Done · Issue 해결)">
          {chartBody(loading, !!data && data.throughput.length > 0, () => <ReactECharts option={throughputOption(data!.throughput, ch)} style={{ height: H }} />)}
        </ChartCard>

        <ChartCard icon={<GitCompareArrows size={16} />} title="이슈 순증감" subtitle="누적 발생 vs 해결">
          {chartBody(loading, !!data && data.issueFlow.length > 0, () => <ReactECharts option={issueFlowOption(data!.issueFlow, ch)} style={{ height: H }} />)}
        </ChartCard>

        <ChartCard
          icon={<Timer size={16} />}
          title="사이클타임 분포"
          subtitle={data ? `완료까지 소요일 · 50/85/95 백분위${data.cycleTime.approxCount > 0 ? ` · ${data.cycleTime.approxCount}건 근사(참고용)` : ''}` : '완료까지 소요일'}
        >
          {chartBody(loading, !!data && data.cycleTime.points.length > 0, () => <ReactECharts option={cycleTimeOption(data!.cycleTime, ch)} style={{ height: H }} />)}
        </ChartCard>

        <ChartCard icon={<Activity size={16} />} title="활동량 추세" subtitle="일별 활동 기록 수">
          {chartBody(loading, !!data && data.activityTrend.length > 0, () => <ReactECharts option={activityTrendOption(data!.activityTrend, ch)} style={{ height: H }} />)}
        </ChartCard>
      </section>

      <ExperimentalSection forecast={forecast} loading={forecastLoading} ch={ch} />
    </div>
  );
}

// 실험(Phase 3) — 예측·고급. 데이터(완료 전이·표본) 누적될수록 정확. 상단 추세와 구분선·배지로 분리.
function ExperimentalSection({ forecast, loading, ch }: { forecast: ForecastBundle | null; loading: boolean; ch: Ch }) {
  return (
    <div className="pt-4 border-t border-default">
      <div className="flex items-center gap-2 mb-3">
        <FlaskConical size={15} className="text-accent" />
        <h2 className="h-section">실험 · 예측·고급</h2>
        <span className="text-[11px] text-muted">(Phase 3 — 데이터 누적될수록 정확, 참고용)</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard icon={<Layers size={16} />} title="누적 흐름도 (CFD)" subtitle="WBS 상태 누적 · 과거 구간 불완전" wide>
          {chartBody(loading, !!forecast && forecast.cfd.length > 0, () => <ReactECharts option={cfdOption(forecast!.cfd, ch)} style={{ height: H }} />)}
        </ChartCard>

        <ChartCard icon={<Dices size={16} />} title="완료일 예측 (Monte Carlo)" subtitle={monteCarloSubtitle(forecast)}>
          {chartBody(loading, !!forecast && forecast.monteCarlo.sufficient, () => <ReactECharts option={monteCarloOption(forecast!.monteCarlo, ch)} style={{ height: H }} />, '데이터 부족 — 완료 표본이 더 쌓이면 표시됩니다')}
        </ChartCard>

        <ChartCard icon={<CalendarClock size={16} />} title="프로젝트 예상 완료" subtitle="현재 처리율 외삽 vs 마감">
          {chartBody(loading, !!forecast && forecast.projectForecasts.length > 0, () => <ReactECharts option={projectForecastOption(forecast!.projectForecasts, ch)} style={{ height: H }} />, '잔여 작업 있는 활성 프로젝트 없음')}
        </ChartCard>

        <ChartCard icon={<Building2 size={16} />} title="부서별 부하" subtitle="미완 항목 · Resource.Department">
          {chartBody(loading, !!forecast && forecast.departmentRollup.length > 0, () => <ReactECharts option={departmentOption(forecast!.departmentRollup, ch)} style={{ height: H }} />, '부서 정보 없음 — 리소스에 부서 입력 시 표시')}
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ icon, title, subtitle, children, wide }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <Card padding="normal" className={wide ? 'lg:col-span-2' : undefined}>
      <h3 className="h-card flex items-center gap-2 mb-1">
        <span className="text-muted">{icon}</span>
        {title} <span className="text-xs font-normal text-muted">{subtitle}</span>
      </h3>
      <div style={{ height: H }}>{children}</div>
    </Card>
  );
}

function chartBody(loading: boolean, hasData: boolean, render: () => React.ReactNode, emptyMsg = '완료/활동 기록이 쌓이면 표시됩니다') {
  if (loading) return <Skeleton height={H} />;
  if (!hasData) return <div className="h-full flex items-center justify-center"><EmptyState icon={<TrendingUp size={28} />} title="데이터 없음" description={emptyMsg} /></div>;
  return render();
}

function monteCarloSubtitle(forecast: ForecastBundle | null): string {
  if (!forecast || !forecast.monteCarlo.sufficient) return '미완 백로그 소진 예측';
  const mc = forecast.monteCarlo;
  return `잔여 ${mc.remaining}건 · 50% ${mc.p50Date ?? '-'} · 85% ${mc.p85Date ?? '-'}`;
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

function throughputOption(weeks: ThroughputWeek[], ch: Ch) {
  const labels = weeks.map((w) => shortMd(w.weekStart));
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...tip(ch) },
    legend: { data: ['WBS', '이슈'], textStyle: { color: ch.axisText, fontSize: 10 }, top: 0, right: 0 },
    grid: { left: 36, right: 12, top: 24, bottom: 22 },
    xAxis: { type: 'category', data: labels, ...baseAxis(ch) },
    yAxis: { type: 'value', minInterval: 1, ...baseAxis(ch) },
    series: [
      { name: 'WBS', type: 'bar', stack: 'done', data: weeks.map((w) => w.wbs), itemStyle: { color: ch.ganttBarDone } },
      { name: '이슈', type: 'bar', stack: 'done', data: weeks.map((w) => w.issue), itemStyle: { color: ch.accentBar, borderRadius: [3, 3, 0, 0] } },
    ],
  };
}

function issueFlowOption(weeks: IssueFlowWeek[], ch: Ch) {
  const labels = weeks.map((w) => shortMd(w.weekStart));
  let co = 0; const cumO = weeks.map((w) => (co += w.opened));
  let cr = 0; const cumR = weeks.map((w) => (cr += w.resolved));
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', ...tip(ch) },
    legend: { data: ['누적 발생', '누적 해결'], textStyle: { color: ch.axisText, fontSize: 10 }, top: 0, right: 0 },
    grid: { left: 36, right: 12, top: 24, bottom: 22 },
    xAxis: { type: 'category', data: labels, ...baseAxis(ch) },
    yAxis: { type: 'value', ...baseAxis(ch) },
    series: [
      { name: '누적 발생', type: 'line', smooth: true, symbol: 'none', data: cumO, lineStyle: { color: ch.ganttToday, width: 2 }, areaStyle: { color: ch.ganttToday, opacity: 0.08 } },
      { name: '누적 해결', type: 'line', smooth: true, symbol: 'none', data: cumR, lineStyle: { color: ch.ganttBarDone, width: 2 }, areaStyle: { color: ch.ganttBarDone, opacity: 0.08 } },
    ],
  };
}

function cycleTimeOption(ct: CycleTime, ch: Ch) {
  const pts = ct.points.map((p, i) => [i, p.days, p.kind, p.title] as [number, number, string, string]);
  return {
    backgroundColor: 'transparent',
    tooltip: {
      ...tip(ch),
      formatter: (p: any) => {
        const v = p.value as [number, number, string, string];
        return `${v[3]}<br/>${v[2] === 'wbs' ? 'WBS' : 'Issue'} · ${v[1]}일`;
      },
    },
    grid: { left: 40, right: 14, top: 28, bottom: 22 },
    xAxis: { type: 'value', name: '완료 순서(시간 →)', nameTextStyle: { color: ch.axisText, fontSize: 9 }, ...baseAxis(ch), splitLine: { show: false } },
    yAxis: { type: 'value', name: '소요일', nameTextStyle: { color: ch.axisText, fontSize: 9 }, ...baseAxis(ch) },
    series: [{
      type: 'scatter', symbolSize: 8, data: pts,
      itemStyle: { color: ch.accentBar, opacity: 0.75 },
      markLine: {
        symbol: 'none', label: { fontSize: 9, position: 'insideEndTop' },
        data: [
          { yAxis: ct.p50, lineStyle: { color: ch.ganttBarDone, type: 'dashed' }, label: { formatter: `50p ${ct.p50}일`, color: ch.ganttBarDone } },
          { yAxis: ct.p85, lineStyle: { color: ch.ganttBarInProgress, type: 'dashed' }, label: { formatter: `85p ${ct.p85}일`, color: ch.ganttBarInProgress } },
          { yAxis: ct.p95, lineStyle: { color: ch.ganttToday, type: 'dashed' }, label: { formatter: `95p ${ct.p95}일`, color: ch.ganttToday } },
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

function cfdOption(cfd: CfdPoint[], ch: Ch) {
  const stack = (name: string, data: number[], color: string, op: number) => ({
    name, type: 'line', stack: 'cfd', smooth: true, symbol: 'none',
    lineStyle: { width: 0 }, areaStyle: { color, opacity: op }, emphasis: { focus: 'series' }, data,
  });
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', ...tip(ch) },
    legend: { data: ['예정', '진행중', '완료'], textStyle: { color: ch.axisText, fontSize: 10 }, top: 0, right: 0 },
    grid: { left: 36, right: 12, top: 24, bottom: 22 },
    xAxis: { type: 'category', boundaryGap: false, data: cfd.map((p) => shortMd(p.date)), ...baseAxis(ch), axisLabel: { color: ch.axisText, fontSize: 8, interval: Math.max(0, Math.floor(cfd.length / 10)) } },
    yAxis: { type: 'value', minInterval: 1, ...baseAxis(ch) },
    series: [
      stack('예정', cfd.map((p) => p.planned), ch.mutedBar, 0.5),
      stack('진행중', cfd.map((p) => p.inProgress), ch.ganttBarInProgress, 0.55),
      stack('완료', cfd.map((p) => p.done), ch.ganttBarDone, 0.55),
    ],
  };
}

function monteCarloOption(mc: MonteCarlo, ch: Ch) {
  const idx = (w: number) => mc.histogram.findIndex((b) => b.weeks === w);
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', ...tip(ch), formatter: (ps: any) => { const b = mc.histogram[ps[0].dataIndex as number]; return `${b.weeks}주 완료: ${b.count}회`; } },
    grid: { left: 40, right: 14, top: 14, bottom: 22 },
    xAxis: { type: 'category', data: mc.histogram.map((b) => `${b.weeks}주`), ...baseAxis(ch) },
    yAxis: { type: 'value', name: '시뮬 빈도', nameTextStyle: { color: ch.axisText, fontSize: 9 }, ...baseAxis(ch) },
    series: [{
      type: 'bar', barWidth: '60%',
      data: mc.histogram.map((b) => ({ value: b.count, itemStyle: { color: b.weeks <= mc.p50Weeks ? ch.ganttBarDone : (b.weeks <= mc.p85Weeks ? ch.ganttBarInProgress : ch.mutedBar), borderRadius: [3, 3, 0, 0] } })),
      markLine: {
        symbol: 'none', label: { fontSize: 9 },
        data: [
          ...(idx(mc.p50Weeks) >= 0 ? [{ xAxis: idx(mc.p50Weeks), lineStyle: { color: ch.ganttBarDone }, label: { formatter: `50% ${mc.p50Weeks}주`, color: ch.ganttBarDone } }] : []),
          ...(idx(mc.p85Weeks) >= 0 ? [{ xAxis: idx(mc.p85Weeks), lineStyle: { color: ch.ganttBarInProgress }, label: { formatter: `85% ${mc.p85Weeks}주`, color: ch.ganttBarInProgress } }] : []),
        ],
      },
    }],
  };
}

function projectForecastOption(items: ProjectForecast[], ch: Ch) {
  const top = items.slice(0, 12);
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, ...tip(ch),
      formatter: (ps: any) => { const f = top[ps[0].dataIndex as number]; return `${f.projectName}<br/>잔여 ${f.remaining}건 · 예상 ${f.projectedWeeks ?? '추정불가'}주 · 마감까지 ${f.weeksToDeadline ?? '-'}주`; },
    },
    legend: { data: ['예상 소요(주)', '마감까지(주)'], textStyle: { color: ch.axisText, fontSize: 10 }, top: 0, right: 0 },
    grid: { left: 90, right: 24, top: 24, bottom: 20 },
    xAxis: { type: 'value', ...baseAxis(ch) },
    yAxis: { type: 'category', inverse: true, data: top.map((f) => f.projectName), axisLine: { lineStyle: { color: ch.axisLine } }, axisLabel: { color: ch.axisText, fontSize: 10, formatter: (v: string) => (v.length > 8 ? v.slice(0, 8) + '…' : v) } },
    series: [
      { name: '예상 소요(주)', type: 'bar', barGap: '-30%', barWidth: 8, data: top.map((f) => ({ value: f.projectedWeeks, itemStyle: { color: f.atRisk ? ch.ganttToday : ch.ganttBarDone } })) },
      { name: '마감까지(주)', type: 'bar', barWidth: 8, data: top.map((f) => f.weeksToDeadline), itemStyle: { color: ch.accentBar } },
    ],
  };
}

function departmentOption(items: DepartmentRollup[], ch: Ch) {
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...tip(ch), formatter: (ps: any) => { const d = items[ps[0].dataIndex as number]; return `${d.department}<br/>미완 ${d.openItems}건 · ${d.people}명`; } },
    grid: { left: 80, right: 28, top: 8, bottom: 20 },
    xAxis: { type: 'value', minInterval: 1, ...baseAxis(ch) },
    yAxis: { type: 'category', inverse: true, data: items.map((d) => d.department), axisLine: { lineStyle: { color: ch.axisLine } }, axisLabel: { color: ch.axisText, fontSize: 10 } },
    series: [{ type: 'bar', barWidth: 12, data: items.map((d) => d.openItems), itemStyle: { color: ch.accentBar, borderRadius: [0, 3, 3, 0] }, label: { show: true, position: 'right', color: ch.axisText, fontSize: 9 } }],
  };
}
