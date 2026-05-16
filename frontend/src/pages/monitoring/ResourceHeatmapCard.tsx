/* eslint-disable @typescript-eslint/no-explicit-any */
// ECharts tooltip/onEvents 가 복잡한 union 타입을 받아 이 파일 안에서만 any 허용
// (MonitoringChartGrid 와 같은 관행).
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { Users, CalendarCheck } from 'lucide-react';
import { Card, Badge, EmptyState, Skeleton } from '../../components/ui';
import { getChartColors, useThemeMode } from '../../utils/themeColors';
import type { ResourceHeatmap, ResourceHeatmapItem } from '../../types';

interface Props {
  data: ResourceHeatmap | null;
  loading: boolean;
}

// ISO 8601 week number (월요일 시작 기준).
function isoWeekNumber(iso: string): number {
  const d = new Date(iso + 'T00:00:00');
  const target = new Date(d);
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
  return 1 + Math.round((diff - ((firstThursday.getDay() + 6) % 7)) / 7);
}

function shortMd(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function ResourceHeatmapCard({ data, loading }: Props) {
  const theme = useThemeMode();
  const colors = getChartColors(theme);
  const navigate = useNavigate();
  // [rowIndex, weekIndex] 로 선택한 셀. null 이면 펼침 없음.
  const [selected, setSelected] = useState<[number, number] | null>(null);

  const option = useMemo(() => {
    if (!data) return null;
    const points: [number, number, number][] = [];
    let max = 0;
    data.rows.forEach((row, ri) => {
      row.counts.forEach((c, wi) => {
        if (c > max) max = c;
        points.push([wi, ri, c]);
      });
    });
    return buildOption(data, points, max, colors, theme);
  }, [data, colors, theme]);

  const selectedItems = useMemo<ResourceHeatmapItem[]>(() => {
    if (!data || !selected) return [];
    const [ri, wi] = selected;
    return data.rows[ri]?.items.filter((it) => it.weekIndex === wi) ?? [];
  }, [data, selected]);

  const selectedLabel = useMemo(() => {
    if (!data || !selected) return '';
    const [ri, wi] = selected;
    const row = data.rows[ri];
    const weekStart = data.weekStarts[wi];
    if (!row || !weekStart) return '';
    return `${row.assignee} · W${isoWeekNumber(weekStart)} (${shortMd(weekStart)} 주)`;
  }, [data, selected]);

  return (
    <Card padding="normal">
      <h3 className="h-card flex items-center gap-2 mb-2">
        <Users size={16} className="text-muted" />
        담당자 × 8주 마감 밀도
      </h3>
      {loading || !data ? (
        <Skeleton height={280} />
      ) : data.totalItems === 0 ? (
        <EmptyState
          icon={<CalendarCheck size={32} />}
          title="다가오는 마감 없음"
          description="앞으로 8주 동안 미완료 항목의 마감이 없습니다."
        />
      ) : (
        <>
          <ReactECharts
            option={option!}
            style={{ height: Math.max(220, data.rows.length * 28 + 80) }}
            onEvents={{
              click: (params: any) => {
                const v = params?.value as [number, number, number] | undefined;
                if (!v) return;
                const [wi, ri, c] = v;
                if (c <= 0) {
                  setSelected(null);
                  return;
                }
                setSelected((prev) =>
                  prev && prev[0] === ri && prev[1] === wi ? null : [ri, wi]
                );
              },
            }}
          />
          {selected && selectedItems.length > 0 && (
            <div className="mt-3 border-t border-default pt-3">
              <p className="text-xs text-muted mb-2">{selectedLabel} — {selectedItems.length}건</p>
              <div className="space-y-1">
                {selectedItems.map((it) => (
                  <button
                    key={`${it.kind}-${it.id}`}
                    type="button"
                    onClick={() =>
                      navigate(
                        it.kind === 'wbs'
                          ? `/projects/${it.projectId}/wbs?highlight=${it.id}`
                          : `/projects/${it.projectId}/issues?highlight=${it.id}`,
                      )
                    }
                    className="w-full text-left flex items-center gap-2 py-1 px-2 -mx-2 rounded hover:bg-surface-2 transition-colors"
                  >
                    <Badge variant={it.kind === 'wbs' ? 'info' : 'warning'} size="sm">
                      {it.kind === 'wbs' ? 'WBS' : 'Issue'}
                    </Badge>
                    <span className="text-sm text-secondary truncate flex-1 min-w-0">{it.title}</span>
                    <span className="text-xs text-muted shrink-0">{it.projectName}</span>
                    <span className="text-xs text-on-warning shrink-0">{shortMd(it.dueDate)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function buildOption(
  data: ResourceHeatmap,
  points: [number, number, number][],
  maxCount: number,
  ch: ReturnType<typeof getChartColors>,
  theme: 'dark' | 'light',
) {
  const xLabels = data.weekStarts.map((ws) => `W${isoWeekNumber(ws)}\n${shortMd(ws)}`);
  const yLabels = data.rows.map((r) => r.assignee);

  return {
    backgroundColor: 'transparent',
    tooltip: {
      position: 'top',
      formatter: (p: any) => {
        const [xi, yi, v] = p.value as [number, number, number];
        const ws = data.weekStarts[xi];
        const name = data.rows[yi]?.assignee ?? '';
        return `${name} · W${isoWeekNumber(ws)} (${shortMd(ws)} 주): ${v}건`;
      },
      backgroundColor: ch.tooltipBg,
      borderColor: ch.tooltipBorder,
      textStyle: { color: ch.tooltipText },
    },
    grid: { left: 96, right: 16, top: 8, bottom: 36 },
    xAxis: {
      type: 'category',
      data: xLabels,
      position: 'bottom',
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: { color: ch.axisText, fontSize: 10, lineHeight: 13 },
      splitArea: { show: true },
    },
    yAxis: {
      type: 'category',
      data: yLabels,
      inverse: true,
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: {
        color: ch.axisText,
        fontSize: 11,
        formatter: (v: string) => (v.length > 10 ? v.slice(0, 10) + '…' : v),
      },
      splitArea: { show: true },
    },
    visualMap: {
      show: false,
      min: 0,
      max: Math.max(maxCount, 1),
      inRange: { color: theme === 'light' ? ['#f3f4f6', '#5b7299'] : ['#1f2937', '#9eb2ce'] },
    },
    series: [
      {
        type: 'heatmap',
        data: points,
        label: {
          show: true,
          color: ch.tooltipText,
          fontSize: 11,
          formatter: (p: any) => {
            const v = (p.value as [number, number, number])[2];
            return v > 0 ? String(v) : '';
          },
        },
        itemStyle: { borderColor: ch.splitLine, borderWidth: 1 },
        emphasis: { itemStyle: { shadowBlur: 8 } },
      },
    ],
  };
}
