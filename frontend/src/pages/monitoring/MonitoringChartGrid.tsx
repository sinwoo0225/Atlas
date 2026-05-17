/* eslint-disable @typescript-eslint/no-explicit-any */
// ECharts 의 tooltip formatter / onEvents callback 들이 복잡한 union 타입을 받기 때문에
// 이 파일 안에서만 any 를 허용한다 (다른 차트 사용처와 같은 관행).
import ReactECharts from 'echarts-for-react';
import { PieChart, AlertTriangle, Diamond, BarChart3, Activity } from 'lucide-react';
import { Card, Skeleton, Badge } from '../../components/ui';
import { getChartColors, useThemeMode, type ChartColors } from '../../utils/themeColors';
import { projectStatusBadge } from '../../utils/statusMaps';
import { ResourceHeatmapCard } from './ResourceHeatmapCard';
import type {
  ActivityByProject,
  IssuePriority, IssueStatus,
  MonitoringCharts as MonitoringChartsData,
  ProjectStatusItem,
  ResourceHeatmap,
} from '../../types';

const STATUS_KEYS: IssueStatus[] = ['Open', 'InProgress', 'Resolved', 'Closed'];
const PRIORITY_KEYS: IssuePriority[] = ['High', 'Medium', 'Low'];
const STATUS_KO: Record<IssueStatus, string> = {
  Open: '열림', InProgress: '진행중', Resolved: '해결', Closed: '닫힘',
};
const PRIORITY_KO: Record<IssuePriority, string> = {
  High: '높음', Medium: '중간', Low: '낮음',
};

// 모든 차트 카드를 280px 균등으로 통일 — 3×2 그리드에서 시각 일관성, 가독성 확보.
const CHART_HEIGHT = 280;

interface Props {
  data: MonitoringChartsData | null;
  activityByProject: ActivityByProject[];
  heatmap: ResourceHeatmap | null;
  loading: boolean;
  onProjectClick: (id: number) => void;
  onActivityProjectClick: (id: number) => void;
}

export function MonitoringChartGrid({
  data, activityByProject, heatmap, loading, onProjectClick, onActivityProjectClick,
}: Props) {
  const theme = useThemeMode();
  const colors = getChartColors(theme);

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card padding="normal">
        <h3 className="h-card flex items-center gap-2 mb-1">
          <PieChart size={16} className="text-muted" />
          프로젝트 상태 분포
        </h3>
        {loading || !data ? (
          <Skeleton height={CHART_HEIGHT} />
        ) : (
          <ProjectStatusBreakdownWidget
            data={data}
            colors={colors}
            theme={theme}
            onProjectClick={onProjectClick}
          />
        )}
      </Card>

      <Card padding="normal">
        <h3 className="h-card flex items-center gap-2 mb-1">
          <AlertTriangle size={16} className="text-muted" />
          이슈 상태 × 우선순위
        </h3>
        {loading || !data ? (
          <Skeleton height={CHART_HEIGHT} />
        ) : data.issueMatrix.every((c) => c.count === 0) ? (
          <p className="text-sm text-muted py-12 text-center">등록된 이슈 없음</p>
        ) : (
          <ReactECharts
            option={buildIssueMatrixOption(data, colors, theme)}
            style={{ height: CHART_HEIGHT }}
          />
        )}
      </Card>

      <Card padding="normal">
        <h3 className="h-card flex items-center gap-2 mb-1">
          <Diamond size={16} className="text-muted" />
          다가오는 마일스톤 (30일)
        </h3>
        {loading || !data ? (
          <Skeleton height={CHART_HEIGHT} />
        ) : data.upcomingMilestones.length === 0 ? (
          <p className="text-sm text-muted py-12 text-center">예정된 마일스톤 없음</p>
        ) : (
          <ReactECharts
            option={buildMilestoneOption(data, colors)}
            style={{ height: CHART_HEIGHT }}
          />
        )}
      </Card>

      <Card padding="normal">
        <h3 className="h-card flex items-center gap-2 mb-1">
          <Activity size={16} className="text-muted" />
          프로젝트별 활동량 <span className="text-xs text-muted font-normal">(최근 30일)</span>
        </h3>
        {loading ? (
          <Skeleton height={CHART_HEIGHT} />
        ) : activityByProject.length === 0 ? (
          <p className="text-sm text-muted py-12 text-center">최근 활동 없음</p>
        ) : (
          <ReactECharts
            option={buildActivityByProjectOption(activityByProject, colors)}
            style={{ height: CHART_HEIGHT }}
            onEvents={{
              click: (params: any) => {
                if (typeof params?.dataIndex === 'number') {
                  const row = activityByProject[params.dataIndex];
                  if (row) onActivityProjectClick(row.projectId);
                }
              },
            }}
          />
        )}
      </Card>

      <Card padding="normal">
        <h3 className="h-card flex items-center gap-2 mb-1">
          <BarChart3 size={16} className="text-muted" />
          프로젝트별 WBS 진행률
        </h3>
        {loading || !data ? (
          <Skeleton height={CHART_HEIGHT} />
        ) : data.wbsProgress.length === 0 ? (
          <p className="text-sm text-muted py-12 text-center">WBS 항목 없음</p>
        ) : (
          <ReactECharts
            option={buildWbsProgressOption(data, colors)}
            style={{ height: CHART_HEIGHT }}
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

      <ResourceHeatmapCard data={heatmap} loading={loading} height={CHART_HEIGHT} />
    </section>
  );
}

// 상태 분포 = 좌측 도넛 + 우측 프로젝트 리스트.
// 도넛은 카운트 시각화, 리스트는 상태별 정렬·상태배지·진행률·D-day 표시.
function ProjectStatusBreakdownWidget({
  data, colors, theme, onProjectClick,
}: {
  data: MonitoringChartsData;
  colors: ChartColors;
  theme: 'dark' | 'light';
  onProjectClick: (id: number) => void;
}) {
  const total = data.projects.length;
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 items-start">
      <div className="relative">
        <ReactECharts
          option={buildProjectStatusOption(data, colors, theme)}
          style={{ height: 140 }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-primary leading-none">{total}</span>
          <span className="text-[10px] text-muted mt-0.5">프로젝트</span>
        </div>
      </div>
      <div className="max-h-[240px] overflow-y-auto pr-1">
        {data.projects.length === 0 ? (
          <p className="text-sm text-muted py-2">프로젝트 없음</p>
        ) : (
          <ul className="space-y-1">
            {data.projects.map((p) => (
              <ProjectStatusListItem key={p.projectId} item={p} onClick={() => onProjectClick(p.projectId)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ProjectStatusListItem({ item, onClick }: { item: ProjectStatusItem; onClick: () => void }) {
  const badge = projectStatusBadge[item.status];
  // 진행률(WBS 완료 비율) 과 D-day(종료일 기준) 둘 다 표시. 종료일 미설정이면 D-day 생략.
  const dd = dDay(item.endDate);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left flex items-center gap-2 py-1 px-2 -mx-2 rounded hover:bg-surface-2 transition-colors"
      >
        <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
        <span className="text-sm text-secondary truncate flex-1 min-w-0">{item.projectName}</span>
        <span className="text-xs shrink-0 tabular-nums flex items-baseline gap-2">
          <span className="text-muted">{item.progressPercent.toFixed(0)}%</span>
          {dd && <span className="text-secondary">{dd}</span>}
        </span>
      </button>
    </li>
  );
}

function dDay(endDate?: string): string {
  if (!endDate) return '';
  const end = new Date(endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const diff = Math.round((end.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'D-day';
  if (diff > 0) return `D-${diff}`;
  return `D+${-diff}`;
}

function buildProjectStatusOption(data: MonitoringChartsData, ch: ChartColors, theme: 'dark' | 'light') {
  const ps = data.projectStatus;
  const COLORS = {
    Planned:    ch.mutedBar,
    Waiting:    theme === 'light' ? '#1d4ed8' : '#7eb6ff',   // --info v2
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
    legend: { show: false },
    series: [{
      type: 'pie',
      radius: ['58%', '78%'],
      center: ['50%', '50%'],
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
    grid: { left: 48, right: 8, top: 8, bottom: 24 },
    xAxis: {
      type: 'category',
      data: STATUS_KEYS.map((s) => STATUS_KO[s]),
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: { color: ch.axisText, fontSize: 10 },
      splitArea: { show: true },
    },
    yAxis: {
      type: 'category',
      data: PRIORITY_KEYS.map((p) => PRIORITY_KO[p]),
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: { color: ch.axisText, fontSize: 10 },
      splitArea: { show: true },
    },
    // visualMap 은 hidden — 라운드 3 정리: x축 라벨과 겹치는 문제 + 셀 숫자 라벨로 의미 전달 충분.
    // 색 그라데이션 자체는 series 의 visualMap 없이도 단일 색상으로 표시되도록 inRange 를 series.itemStyle 로 옮길 수 있지만,
    // ECharts heatmap 은 visualMap 없으면 색 매핑이 안 되므로 visualMap 은 유지하되 show: false.
    visualMap: {
      min: 0,
      max: Math.max(maxCount, 1),
      calculable: false,
      // v2: 라이트 시작 = surface-2 warm / 끝 = accent deep. 다크 시작 = surface-2 v2.
      inRange: { color: theme === 'light' ? ['#f0ebe0', '#4a6797'] : ['#2a2f3a', '#9eb2ce'] },
      show: false,
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
    grid: { left: 8, right: 8, top: 16, bottom: 22 },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: { color: ch.axisText, fontSize: 9 },
      splitLine: { lineStyle: { color: ch.splitLine } },
    },
    yAxis: { type: 'value', min: 0, max: 3, show: false },
    series: [{
      type: 'scatter',
      symbol: 'diamond',
      symbolSize: 12,
      data: points,
      itemStyle: { color: ch.ganttMilestone },
      label: {
        show: true,
        position: 'top',
        formatter: (p: any) => (p.data as { name: string }).name,
        color: ch.axisText,
        fontSize: 9,
      },
    }],
  };
}

function buildActivityByProjectOption(items: ActivityByProject[], ch: ChartColors) {
  // 가로 막대 — 카운트 DESC 가 백엔드 정렬, ECharts 는 yAxis 가 위에서 아래로 그려지므로
  // inverse: true 로 가장 활발한 프로젝트가 상단에 오게 한다.
  // 220px 컴팩트 카드 — top 10 만 표시 (스크롤 없이).
  const top = items.slice(0, 10);
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const p = (params as any[])[0];
        const item = top[p.dataIndex as number];
        return `<b>${item.projectName}</b><br/>${item.count}건`;
      },
      backgroundColor: ch.tooltipBg, borderColor: ch.tooltipBorder,
      textStyle: { color: ch.tooltipText },
    },
    grid: { left: 100, right: 32, top: 4, bottom: 16 },
    xAxis: {
      type: 'value',
      axisLabel: { color: ch.axisText, fontSize: 9 },
      splitLine: { lineStyle: { color: ch.splitLine } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: top.map((i) => i.projectName),
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: {
        color: ch.axisText, fontSize: 10,
        formatter: (v: string) => v.length > 12 ? v.slice(0, 12) + '…' : v,
      },
    },
    series: [{
      type: 'bar',
      data: top.map((i) => i.count),
      barWidth: 10,
      itemStyle: { color: ch.accentBar, borderRadius: [0, 3, 3, 0] },
      label: {
        show: true,
        position: 'right',
        color: ch.axisText,
        fontSize: 9,
        formatter: (p: any) => String(top[p.dataIndex as number].count),
      },
      cursor: 'pointer',
    }],
  };
}

function buildWbsProgressOption(data: MonitoringChartsData, ch: ChartColors) {
  // 220px 컴팩트 — top 10 만.
  const items = data.wbsProgress.slice(0, 10);
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
    grid: { left: 100, right: 48, top: 4, bottom: 16 },
    xAxis: {
      type: 'value', min: 0, max: 100,
      axisLabel: { formatter: '{value}%', color: ch.axisText, fontSize: 9 },
      splitLine: { lineStyle: { color: ch.splitLine } },
    },
    yAxis: {
      type: 'category',
      data: items.map((i) => i.projectName),
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: {
        color: ch.axisText, fontSize: 10,
        formatter: (v: string) => v.length > 12 ? v.slice(0, 12) + '…' : v,
      },
    },
    series: [{
      type: 'bar',
      data: items.map((i) => i.progressPercent),
      barWidth: 10,
      itemStyle: { color: ch.accentBar, borderRadius: [0, 3, 3, 0] },
      label: {
        show: true,
        position: 'right',
        color: ch.axisText,
        fontSize: 9,
        formatter: (p: any) => {
          const item = items[p.dataIndex as number];
          return `${item.done}/${item.total}`;
        },
      },
      cursor: 'pointer',
    }],
  };
}
