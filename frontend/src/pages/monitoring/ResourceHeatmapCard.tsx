/* eslint-disable @typescript-eslint/no-explicit-any */
// ECharts tooltip/onEvents 가 복잡한 union 타입을 받아 이 파일 안에서만 any 허용
// (MonitoringChartGrid 와 같은 관행).
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { Users, CalendarCheck } from 'lucide-react';
import { Card, Badge, EmptyState, Skeleton, Modal } from '../../components/ui';
import { getChartColors, useThemeMode, effectiveLightDark } from '../../utils/themeColors';
import type { ResourceHeatmap, ResourceHeatmapItem, ResourceHeatmapRow } from '../../types';

interface Props {
  data: ResourceHeatmap | null;
  loading: boolean;
  /** 호출처가 카드 높이를 일정하게 맞출 때 사용 (예: 모니터링 3×2 그리드 220px). */
  height?: number;
}

type SortMode = 'due' | 'name' | 'load';

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

export function ResourceHeatmapCard({ data, loading, height = 220 }: Props) {
  const theme = useThemeMode();
  const colors = getChartColors(theme);
  const navigate = useNavigate();
  // 셀 클릭 → 펼침 모달. 컴팩트 카드라 inline 펼침 대신 모달.
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('due');

  // 미할당 항목은 백엔드에서 행으로 누적하지 않고 unassignedItems 카운트로만 노출.
  const sortedRows = useMemo<ResourceHeatmapRow[]>(() => {
    if (!data) return [];
    const rows = [...data.rows];
    if (sortMode === 'load') {
      rows.sort((a, b) =>
        b.counts.reduce((s, c) => s + c, 0) - a.counts.reduce((s, c) => s + c, 0));
    } else if (sortMode === 'name') {
      rows.sort((a, b) => a.assignee.localeCompare(b.assignee, 'ko'));
    } else {
      // 마감순 = 가장 이른 마감 주(counts > 0 인 weekIndex 최소) 가 위로.
      rows.sort((a, b) => {
        const ea = a.counts.findIndex((c) => c > 0);
        const eb = b.counts.findIndex((c) => c > 0);
        const ax = ea < 0 ? Infinity : ea;
        const bx = eb < 0 ? Infinity : eb;
        return ax - bx;
      });
    }
    return rows;
  }, [data, sortMode]);

  const option = useMemo(() => {
    if (!data || sortedRows.length === 0) return null;
    const points: [number, number, number][] = [];
    let max = 0;
    sortedRows.forEach((row, ri) => {
      row.counts.forEach((c, wi) => {
        if (c > max) max = c;
        points.push([wi, ri, c]);
      });
    });
    return buildOption(data.weekStarts, sortedRows, points, max, colors, effectiveLightDark(theme));
  }, [data, sortedRows, colors, theme]);

  const selectedItems = useMemo<ResourceHeatmapItem[]>(() => {
    if (!data || !selected) return [];
    const [ri, wi] = selected;
    return sortedRows[ri]?.items.filter((it) => it.weekIndex === wi) ?? [];
  }, [data, sortedRows, selected]);

  const selectedLabel = useMemo(() => {
    if (!data || !selected) return '';
    const [ri, wi] = selected;
    const row = sortedRows[ri];
    const weekStart = data.weekStarts[wi];
    if (!row || !weekStart) return '';
    return `${row.assignee} · W${isoWeekNumber(weekStart)} (${shortMd(weekStart)} 주)`;
  }, [data, sortedRows, selected]);

  return (
    <Card padding="normal">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="h-card flex items-center gap-2">
          <Users size={16} className="text-muted" />
          담당자 × 8주
          {data && data.unassignedItems > 0 && (
            <span className="text-xs font-normal text-muted" title="담당자 미지정 항목 (히트맵 제외)">
              · 미할당 {data.unassignedItems}건
            </span>
          )}
        </h3>
        {data && sortedRows.length > 0 && (
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="text-xs px-2 py-1 bg-surface-2 border border-default rounded text-secondary"
            title="정렬"
          >
            <option value="due">마감 임박순</option>
            <option value="name">이름순</option>
            <option value="load">부하 합계순</option>
          </select>
        )}
      </div>
      {loading || !data ? (
        <Skeleton height={height} />
      ) : sortedRows.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck size={28} />}
          title={data.unassignedItems > 0 ? '할당된 마감 없음' : '다가오는 마감 없음'}
          description={data.unassignedItems > 0
            ? `미할당 ${data.unassignedItems}건만 있음 — 담당자 배정 후 히트맵에 표시됩니다`
            : '앞으로 8주간 미완료 마감 없음'}
        />
      ) : (
        <ReactECharts
          option={option!}
          style={{ height }}
          onEvents={{
            click: (params: any) => {
              const v = params?.value as [number, number, number] | undefined;
              if (!v) return;
              const [wi, ri, c] = v;
              if (c > 0) setSelected([ri, wi]);
            },
          }}
        />
      )}

      {selected && selectedItems.length > 0 && (
        <Modal
          open
          onClose={() => setSelected(null)}
          title={`${selectedLabel} — ${selectedItems.length}건`}
          showCloseButton
          size="md"
        >
          <div className="space-y-1 p-4">
            {selectedItems.map((it) => (
              <button
                key={`${it.kind}-${it.id}`}
                type="button"
                onClick={() => {
                  navigate(
                    it.kind === 'wbs'
                      ? `/projects/${it.projectId}/wbs?highlight=${it.id}`
                      : `/projects/${it.projectId}/issues?highlight=${it.id}`,
                  );
                  setSelected(null);
                }}
                className="w-full text-left flex items-center gap-2 py-1.5 px-2 rounded hover:bg-surface-2 transition-colors"
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
        </Modal>
      )}
    </Card>
  );
}

function buildOption(
  weekStarts: string[],
  rows: ResourceHeatmapRow[],
  points: [number, number, number][],
  maxCount: number,
  ch: ReturnType<typeof getChartColors>,
  theme: 'dark' | 'light',
) {
  // 컴팩트 220px 카드: 라벨 짧게 (월/일만), 좌측 폭 줄임.
  const xLabels = weekStarts.map((ws) => shortMd(ws));
  const yLabels = rows.map((r) => r.assignee);

  return {
    backgroundColor: 'transparent',
    tooltip: {
      position: 'top',
      formatter: (p: any) => {
        const [xi, yi, v] = p.value as [number, number, number];
        const ws = weekStarts[xi];
        const name = rows[yi]?.assignee ?? '';
        return `${name} · W${isoWeekNumber(ws)} (${shortMd(ws)} 주): ${v}건`;
      },
      backgroundColor: ch.tooltipBg,
      borderColor: ch.tooltipBorder,
      textStyle: { color: ch.tooltipText },
    },
    grid: { left: 56, right: 8, top: 4, bottom: 20 },
    xAxis: {
      type: 'category',
      data: xLabels,
      position: 'bottom',
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: { color: ch.axisText, fontSize: 9 },
      splitArea: { show: true },
    },
    yAxis: {
      type: 'category',
      data: yLabels,
      inverse: true,
      axisLine: { lineStyle: { color: ch.axisLine } },
      axisLabel: {
        color: ch.axisText,
        fontSize: 10,
        formatter: (v: string) => (v.length > 6 ? v.slice(0, 6) + '…' : v),
      },
      splitArea: { show: true },
    },
    visualMap: {
      show: false,
      min: 0,
      max: Math.max(maxCount, 1),
      // v2: 라이트 시작 = surface-2 warm (#f0ebe0), 끝 = accent deep (#4a6797). 다크 시작 = surface-2 v2.
      inRange: { color: theme === 'light' ? ['#f0ebe0', '#4a6797'] : ['#2a2f3a', '#9eb2ce'] },
    },
    series: [
      {
        type: 'heatmap',
        data: points,
        label: {
          show: true,
          color: ch.tooltipText,
          fontSize: 10,
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
