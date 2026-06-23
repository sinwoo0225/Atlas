/* eslint-disable @typescript-eslint/no-explicit-any */
// ECharts tooltip/visualMap 가 복잡한 union 타입을 받아 이 파일 안에서만 any 허용 (ResourceHeatmapCard 관행).
import { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Gauge, CalendarCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card, EmptyState, Skeleton } from '../../components/ui';
import { getChartColors, useThemeMode, effectiveLightDark } from '../../utils/themeColors';
import type { CapacityHeatmap, ResourceCapacityRow } from '../../types';

interface Props {
  data: CapacityHeatmap | null;
  loading: boolean;
  height?: number;
}

type SortMode = 'load' | 'name' | 'over';

function shortMd(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function CapacityHeatmapCard({ data, loading, height = 280 }: Props) {
  const { t } = useTranslation();
  const theme = useThemeMode();
  const colors = getChartColors(theme);
  const [sortMode, setSortMode] = useState<SortMode>('load');

  const sortedRows = useMemo<ResourceCapacityRow[]>(() => {
    if (!data) return [];
    const rows = [...data.rows];
    if (sortMode === 'name') rows.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    else if (sortMode === 'over') rows.sort((a, b) => b.overallocatedWeeks - a.overallocatedWeeks);
    else rows.sort((a, b) => b.totalDemandHours - a.totalDemandHours);
    return rows;
  }, [data, sortMode]);

  const option = useMemo(() => {
    if (!data || sortedRows.length === 0) return null;
    return buildOption(data.weekStarts, sortedRows, colors, effectiveLightDark(theme), t);
  }, [data, sortedRows, colors, theme, t]);

  return (
    <Card padding="normal">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="h-card flex items-center gap-2">
          <Gauge size={16} className="text-muted" />
          {t('monitoring:capacity.title')}
          {data && (data.unestimatedTaskCount > 0 || data.unscheduledDemandHours > 0) && (
            <span className="text-xs font-normal text-muted" title={t('monitoring:capacity.gapsTip')}>
              {data.unestimatedTaskCount > 0 && t('monitoring:capacity.unestimated', { count: data.unestimatedTaskCount })}
              {data.unestimatedTaskCount > 0 && data.unscheduledDemandHours > 0 && ' · '}
              {data.unscheduledDemandHours > 0 && t('monitoring:capacity.unscheduled', { hours: data.unscheduledDemandHours })}
            </span>
          )}
        </h3>
        {data && sortedRows.length > 0 && (
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="text-xs px-2 py-1 bg-surface-2 border border-default rounded text-secondary"
            title={t('monitoring:capacity.sortTitle')}
          >
            <option value="load">{t('monitoring:capacity.sortLoad')}</option>
            <option value="over">{t('monitoring:capacity.sortOver')}</option>
            <option value="name">{t('monitoring:capacity.sortName')}</option>
          </select>
        )}
      </div>
      {loading || !data ? (
        <Skeleton height={height} />
      ) : sortedRows.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height }}>
          <EmptyState
            icon={<CalendarCheck size={28} />}
            title={t('monitoring:capacity.empty')}
            description={t('monitoring:capacity.emptyDesc')}
          />
        </div>
      ) : (
        <ReactECharts option={option!} style={{ height }} />
      )}
    </Card>
  );
}

function buildOption(
  weekStarts: string[],
  rows: ResourceCapacityRow[],
  ch: ReturnType<typeof getChartColors>,
  theme: 'dark' | 'light',
  t: TFunction,
) {
  const xLabels = weekStarts.map((ws) => shortMd(ws));
  const yLabels = rows.map((r) => r.name);
  // 데이터 = {value:[wi,ri,util], over, demand, cap}. 과배분 셀은 적색 테두리 강조.
  const points = rows.flatMap((row, ri) =>
    row.weeks.map((c, wi) => ({
      value: [wi, ri, Math.round(c.utilizationPercent)],
      itemStyle: c.overallocated
        ? { borderColor: theme === 'light' ? '#b91c1c' : '#f87171', borderWidth: 2 }
        : { borderColor: ch.splitLine, borderWidth: 1 },
      demand: c.demandHours,
      cap: c.capacityHours,
    })),
  );

  return {
    backgroundColor: 'transparent',
    tooltip: {
      position: 'top',
      formatter: (p: any) => {
        const [, , util] = p.value as [number, number, number];
        const d = p.data ?? {};
        return t('monitoring:capacity.cellTooltip', {
          name: yLabels[(p.value as number[])[1]] ?? '',
          date: shortMd(weekStarts[(p.value as number[])[0]]),
          demand: d.demand ?? 0,
          capacity: d.cap ?? 0,
          util,
        });
      },
      backgroundColor: ch.tooltipBg,
      borderColor: ch.tooltipBorder,
      textStyle: { color: ch.tooltipText },
    },
    grid: { left: 70, right: 12, top: 8, bottom: 22 },
    xAxis: {
      type: 'category', data: xLabels, position: 'bottom',
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: { color: ch.axisText, fontSize: 9 },
      splitArea: { show: true },
    },
    yAxis: {
      type: 'category', data: yLabels, inverse: true,
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: { color: ch.axisText, fontSize: 10, formatter: (v: string) => (v.length > 7 ? v.slice(0, 7) + '…' : v) },
      splitArea: { show: true },
    },
    // 가동률 색: 0 안정 → 80~100 경고 → >100 적색. piecewise 로 명확히.
    visualMap: {
      show: false, type: 'piecewise', dimension: 2, min: 0, max: 200,
      pieces: [
        { lte: 70, color: theme === 'light' ? '#dbe8d8' : '#2f4030' },
        { gt: 70, lte: 90, color: theme === 'light' ? '#cfe0c8' : '#3d5238' },
        { gt: 90, lte: 100, color: theme === 'light' ? '#f0d8a0' : '#6b5a2a' },
        { gt: 100, lte: 130, color: theme === 'light' ? '#e0a878' : '#8a5a3a' },
        { gt: 130, color: theme === 'light' ? '#cf7a6a' : '#a84a3a' },
      ],
    },
    series: [{
      type: 'heatmap', data: points,
      label: {
        show: true, color: ch.tooltipText, fontSize: 9,
        formatter: (p: any) => { const v = (p.value as number[])[2]; return v > 0 ? `${v}%` : ''; },
      },
      emphasis: { itemStyle: { shadowBlur: 8 } },
    }],
  };
}
