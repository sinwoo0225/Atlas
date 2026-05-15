/* eslint-disable @typescript-eslint/no-explicit-any */
// ECharts 의 tooltip formatter / onEvents callback 들이 복잡한 union 타입을 받기 때문에
// 이 파일 안에서만 any 를 허용한다 (다른 차트 사용처와 같은 관행).
import ReactECharts from 'echarts-for-react';
import { PieChart, AlertTriangle, Diamond, BarChart3 } from 'lucide-react';
import { Card, Skeleton } from '../../components/ui';
import { getChartColors, useThemeMode, type ChartColors } from '../../utils/themeColors';
import type {
  IssuePriority, IssueStatus,
  MonitoringCharts as MonitoringChartsData,
} from '../../types';

const STATUS_KEYS: IssueStatus[] = ['Open', 'InProgress', 'Resolved', 'Closed'];
const PRIORITY_KEYS: IssuePriority[] = ['High', 'Medium', 'Low'];
const STATUS_KO: Record<IssueStatus, string> = {
  Open: '열림', InProgress: '진행중', Resolved: '해결', Closed: '닫힘',
};
const PRIORITY_KO: Record<IssuePriority, string> = {
  High: '높음', Medium: '중간', Low: '낮음',
};

export function MonitoringChartGrid({
  data, loading, onProjectClick,
}: {
  data: MonitoringChartsData | null;
  loading: boolean;
  onProjectClick: (id: number) => void;
}) {
  const theme = useThemeMode();
  const colors = getChartColors(theme);

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card padding="normal">
        <h3 className="h-card flex items-center gap-2 mb-2">
          <PieChart size={16} className="text-muted" />
          프로젝트 상태 분포
        </h3>
        {loading || !data ? (
          <Skeleton height={240} />
        ) : (
          <ReactECharts
            option={buildProjectStatusOption(data, colors, theme)}
            style={{ height: 240 }}
          />
        )}
      </Card>

      <Card padding="normal">
        <h3 className="h-card flex items-center gap-2 mb-2">
          <AlertTriangle size={16} className="text-muted" />
          이슈 상태 × 우선순위
        </h3>
        {loading || !data ? (
          <Skeleton height={240} />
        ) : data.issueMatrix.every((c) => c.count === 0) ? (
          <p className="text-sm text-muted py-12 text-center">등록된 이슈 없음</p>
        ) : (
          <ReactECharts
            option={buildIssueMatrixOption(data, colors, theme)}
            style={{ height: 240 }}
          />
        )}
      </Card>

      <Card padding="normal">
        <h3 className="h-card flex items-center gap-2 mb-2">
          <Diamond size={16} className="text-muted" />
          다가오는 마일스톤 (30일)
        </h3>
        {loading || !data ? (
          <Skeleton height={240} />
        ) : data.upcomingMilestones.length === 0 ? (
          <p className="text-sm text-muted py-12 text-center">예정된 마일스톤 없음</p>
        ) : (
          <ReactECharts
            option={buildMilestoneOption(data, colors)}
            style={{ height: 240 }}
          />
        )}
      </Card>

      <Card padding="normal">
        <h3 className="h-card flex items-center gap-2 mb-2">
          <BarChart3 size={16} className="text-muted" />
          프로젝트별 WBS 진행률
        </h3>
        {loading || !data ? (
          <Skeleton height={240} />
        ) : data.wbsProgress.length === 0 ? (
          <p className="text-sm text-muted py-12 text-center">WBS 항목 없음</p>
        ) : (
          <ReactECharts
            option={buildWbsProgressOption(data, colors)}
            style={{ height: Math.max(240, data.wbsProgress.length * 28 + 40) }}
            onEvents={{
              click: (params: any) => {
                if (typeof params?.dataIndex === 'number') {
                  const p = data.wbsProgress[params.dataIndex];
                  if (p) onProjectClick(p.projectId);
                }
              },
            }}
          />
        )}
      </Card>
    </section>
  );
}

function buildProjectStatusOption(data: MonitoringChartsData, ch: ChartColors, theme: 'dark' | 'light') {
  const ps = data.projectStatus;
  const COLORS = {
    Planned:    ch.mutedBar,
    Waiting:    theme === 'light' ? '#3b82f6' : '#60a5fa',
    InProgress: ch.ganttBarInProgress,
    Done:       ch.ganttBarDone,
  };
  const points = [
    { name: '계획', value: ps.planned,    itemStyle: { color: COLORS.Planned } },
    { name: '대기', value: ps.waiting,    itemStyle: { color: COLORS.Waiting } },
    { name: '진행', value: ps.inProgress, itemStyle: { color: COLORS.InProgress } },
    { name: '완료', value: ps.done,       itemStyle: { color: COLORS.Done } },
  ].filter((d) => d.value > 0);

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: ch.tooltipBg, borderColor: ch.tooltipBorder,
      textStyle: { color: ch.tooltipText },
    },
    legend: {
      orient: 'horizontal', bottom: 4,
      textStyle: { color: ch.axisText, fontSize: 11 },
    },
    series: [{
      type: 'pie',
      radius: ['45%', '70%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      label: { show: false },
      data: points,
    }],
  };
}

function buildIssueMatrixOption(data: MonitoringChartsData, ch: ChartColors, theme: 'dark' | 'light') {
  const map = new Map<string, number>();
  for (const c of data.issueMatrix) map.set(`${c.status}|${c.priority}`, c.count);

  const dataPoints: [number, number, number][] = [];
  let maxCount = 0;
  for (let yi = 0; yi < PRIORITY_KEYS.length; yi++) {
    for (let xi = 0; xi < STATUS_KEYS.length; xi++) {
      const v = map.get(`${STATUS_KEYS[xi]}|${PRIORITY_KEYS[yi]}`) ?? 0;
      maxCount = Math.max(maxCount, v);
      dataPoints.push([xi, yi, v]);
    }
  }

  return {
    backgroundColor: 'transparent',
    tooltip: {
      position: 'top',
      formatter: (p: any) => {
        const [xi, yi, v] = p.value as [number, number, number];
        return `${STATUS_KO[STATUS_KEYS[xi]]} × ${PRIORITY_KO[PRIORITY_KEYS[yi]]}: ${v}건`;
      },
      backgroundColor: ch.tooltipBg, borderColor: ch.tooltipBorder,
      textStyle: { color: ch.tooltipText },
    },
    grid: { left: 60, right: 16, top: 12, bottom: 44 },
    xAxis: {
      type: 'category',
      data: STATUS_KEYS.map((s) => STATUS_KO[s]),
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: { color: ch.axisText, fontSize: 11 },
      splitArea: { show: true },
    },
    yAxis: {
      type: 'category',
      data: PRIORITY_KEYS.map((p) => PRIORITY_KO[p]),
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: { color: ch.axisText, fontSize: 11 },
      splitArea: { show: true },
    },
    visualMap: {
      min: 0,
      max: Math.max(maxCount, 1),
      calculable: false,
      orient: 'horizontal',
      bottom: 4, left: 'center',
      itemWidth: 12, itemHeight: 80,
      textStyle: { color: ch.axisText, fontSize: 10 },
      inRange: { color: theme === 'light' ? ['#f3f4f6', '#5b7299'] : ['#1f2937', '#9eb2ce'] },
      show: maxCount > 0,
    },
    series: [{
      type: 'heatmap',
      data: dataPoints,
      label: {
        show: true,
        color: ch.tooltipText,
        formatter: (p: any) => {
          const v = (p.value as [number, number, number])[2];
          return v > 0 ? String(v) : '';
        },
      },
      itemStyle: { borderColor: ch.splitLine, borderWidth: 1 },
      emphasis: { itemStyle: { shadowBlur: 8 } },
    }],
  };
}

function buildMilestoneOption(data: MonitoringChartsData, ch: ChartColors) {
  // 3 줄로 분산 배치해 label 겹침 완화. y=0..2 정수, +0.5 offset.
  const milestones = data.upcomingMilestones;
  const points = milestones.map((m, i) => ({
    name: m.name,
    projectName: m.projectName,
    value: [m.endDate, (i % 3) + 0.5] as [string, number],
  }));
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => {
        const d = p.data as { name: string; projectName: string; value: [string, number] };
        return `<b>${d.name}</b><br/>${d.projectName}<br/>${new Date(d.value[0]).toLocaleDateString('ko-KR')}`;
      },
      backgroundColor: ch.tooltipBg, borderColor: ch.tooltipBorder,
      textStyle: { color: ch.tooltipText },
    },
    grid: { left: 16, right: 16, top: 24, bottom: 28 },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: { color: ch.axisText, fontSize: 10 },
      splitLine: { lineStyle: { color: ch.splitLine } },
    },
    yAxis: { type: 'value', min: 0, max: 3, show: false },
    series: [{
      type: 'scatter',
      symbol: 'diamond',
      symbolSize: 14,
      data: points,
      itemStyle: { color: ch.ganttMilestone },
      label: {
        show: true,
        position: 'top',
        formatter: (p: any) => (p.data as { name: string }).name,
        color: ch.axisText,
        fontSize: 10,
      },
    }],
  };
}

function buildWbsProgressOption(data: MonitoringChartsData, ch: ChartColors) {
  const items = data.wbsProgress;
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const p = (params as any[])[0];
        const idx = p.dataIndex as number;
        const item = items[idx];
        return `<b>${item.projectName}</b><br/>${item.done} / ${item.total} (${item.progressPercent}%)`;
      },
      backgroundColor: ch.tooltipBg, borderColor: ch.tooltipBorder,
      textStyle: { color: ch.tooltipText },
    },
    grid: { left: 120, right: 56, top: 12, bottom: 24 },
    xAxis: {
      type: 'value', min: 0, max: 100,
      axisLabel: { formatter: '{value}%', color: ch.axisText, fontSize: 10 },
      splitLine: { lineStyle: { color: ch.splitLine } },
    },
    yAxis: {
      type: 'category',
      data: items.map((i) => i.projectName),
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: {
        color: ch.axisText, fontSize: 11,
        formatter: (v: string) => v.length > 14 ? v.slice(0, 14) + '…' : v,
      },
    },
    series: [{
      type: 'bar',
      data: items.map((i) => i.progressPercent),
      barWidth: 14,
      itemStyle: { color: ch.accentBar, borderRadius: [0, 3, 3, 0] },
      label: {
        show: true,
        position: 'right',
        color: ch.axisText,
        fontSize: 10,
        formatter: (p: any) => {
          const item = items[p.dataIndex as number];
          return `${item.done}/${item.total}`;
        },
      },
      cursor: 'pointer',
    }],
  };
}
