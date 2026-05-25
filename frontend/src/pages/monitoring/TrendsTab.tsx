/* eslint-disable @typescript-eslint/no-explicit-any */
// ECharts tooltip 이 복잡한 union 타입을 받아 이 파일 안에서만 any 허용 (MonitoringChartGrid 와 같은 관행).
import ReactECharts from 'echarts-for-react';
import { TrendingUp, GitCompareArrows, Timer, Activity } from 'lucide-react';
import { Card, Skeleton, EmptyState } from '../../components/ui';
import { getChartColors, useThemeMode } from '../../utils/themeColors';
import type { CycleTime, IssueFlowWeek, ActivityTrendDay, MonitoringTrends, ThroughputWeek } from '../../types';

const H = 280;
type Ch = ReturnType<typeof getChartColors>;

function shortMd(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// '추세' 탭 — ActivityLog 상태전이 재구성 기반 흐름 지표 (Vacanti Flow Metrics).
// 완료 시점은 Status→완료 전이, 전이기록 없는 과거 항목은 UpdatedAt 근사(사이클타임 캡션에 표기).
export function TrendsTab({ data, loading }: { data: MonitoringTrends | null; loading: boolean }) {
  const theme = useThemeMode();
  const ch = getChartColors(theme);
  return (
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
  );
}

function ChartCard({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Card padding="normal">
      <h3 className="h-card flex items-center gap-2 mb-1">
        <span className="text-muted">{icon}</span>
        {title} <span className="text-xs font-normal text-muted">{subtitle}</span>
      </h3>
      <div style={{ height: H }}>{children}</div>
    </Card>
  );
}

function chartBody(loading: boolean, hasData: boolean, render: () => React.ReactNode) {
  if (loading) return <Skeleton height={H} />;
  if (!hasData) return <div className="h-full flex items-center justify-center"><EmptyState icon={<TrendingUp size={28} />} title="데이터 없음" description="완료/활동 기록이 쌓이면 표시됩니다" /></div>;
  return render();
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
