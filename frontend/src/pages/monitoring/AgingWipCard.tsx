/* eslint-disable @typescript-eslint/no-explicit-any */
// ECharts tooltip/onEvents 가 복잡한 union 타입을 받아 이 파일 안에서만 any 허용
// (MonitoringChartGrid 와 같은 관행).
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { Hourglass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card, Skeleton, EmptyState } from '../../components/ui';
import { getChartColors, useThemeMode } from '../../utils/themeColors';
import type { AgingWipItem } from '../../types';

const CHART_HEIGHT = 280;
const TOP = 12;
// 진행중 항목이 며칠 묵으면 경고할지(임계). Phase 2 에서 사이클타임 85백분위로 교체 예정.
const THRESHOLD = 14;

// Aging WIP — 현재 진행중(WBS InProgress / 이슈 Open·InProgress) 항목을 나이순으로.
// 끝난 일이 아니라 '지금 막혀있는 일'을 잡는다(Vacanti). 임계 초과는 danger, 근접은 warning.
export function AgingWipCard({ data, loading }: { data: AgingWipItem[]; loading: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const theme = useThemeMode();
  const ch = getChartColors(theme);
  const top = data.slice(0, TOP);

  return (
    <Card padding="normal">
      <h3 className="h-card flex items-center gap-2 mb-1">
        <Hourglass size={16} className="text-muted" />
        {t('monitoring:aging.title')} <span className="text-xs font-normal text-muted">{t('monitoring:aging.tag')}</span>
      </h3>
      {loading ? (
        <Skeleton height={CHART_HEIGHT} />
      ) : top.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: CHART_HEIGHT }}>
          <EmptyState icon={<Hourglass size={28} />} title={t('monitoring:aging.empty')} />
        </div>
      ) : (
        <ReactECharts
          option={buildOption(top, ch, t)}
          style={{ height: CHART_HEIGHT }}
          onEvents={{
            click: (params: any) => {
              const it = top[params?.dataIndex as number];
              if (it) {
                navigate(it.kind === 'wbs'
                  ? `/projects/${it.projectId}/wbs?highlight=${it.id}`
                  : `/projects/${it.projectId}/issues?highlight=${it.id}`);
              }
            },
          }}
        />
      )}
    </Card>
  );
}

function colorFor(age: number, ch: ReturnType<typeof getChartColors>): string {
  if (age >= THRESHOLD) return ch.ganttToday;           // danger
  if (age >= THRESHOLD * 0.6) return ch.ganttBarInProgress; // warning amber
  return ch.accentBar;
}

function buildOption(items: AgingWipItem[], ch: ReturnType<typeof getChartColors>, t: TFunction) {
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const it = items[(params as any[])[0].dataIndex as number];
        const tag = it.kind === 'wbs' ? 'WBS' : 'Issue';
        return `<b>${it.title}</b><br/>${it.projectName} · ${tag}<br/>${t('monitoring:aging.tooltipAge', { days: it.ageDays })}${it.assignee ? ` · ${it.assignee}` : ''}`;
      },
      backgroundColor: ch.tooltipBg, borderColor: ch.tooltipBorder, textStyle: { color: ch.tooltipText },
    },
    grid: { left: 110, right: 40, top: 8, bottom: 22 },
    xAxis: {
      type: 'value',
      name: t('monitoring:aging.axisAge'),
      nameTextStyle: { color: ch.axisText, fontSize: 9 },
      axisLabel: { color: ch.axisText, fontSize: 9 },
      splitLine: { lineStyle: { color: ch.splitLine } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: items.map((i) => i.title),
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: {
        color: ch.axisText, fontSize: 10,
        formatter: (v: string) => (v.length > 13 ? v.slice(0, 13) + '…' : v),
      },
    },
    series: [{
      type: 'bar',
      barWidth: 11,
      data: items.map((i) => ({ value: i.ageDays, itemStyle: { color: colorFor(i.ageDays, ch), borderRadius: [0, 3, 3, 0] } })),
      label: { show: true, position: 'right', color: ch.axisText, fontSize: 9, formatter: (p: any) => `${items[p.dataIndex as number].ageDays}d` },
      markLine: {
        symbol: 'none',
        label: { color: ch.axisText, fontSize: 9, formatter: t('monitoring:aging.thresholdLabel', { days: THRESHOLD }) },
        lineStyle: { color: ch.ganttToday, type: 'dashed' },
        data: [{ xAxis: THRESHOLD }],
      },
      cursor: 'pointer',
    }],
  };
}
