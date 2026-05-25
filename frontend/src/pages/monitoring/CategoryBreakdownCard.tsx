/* eslint-disable @typescript-eslint/no-explicit-any */
// ECharts tooltip 이 복잡한 union 타입을 받아 이 파일 안에서만 any 허용 (MonitoringChartGrid 와 같은 관행).
import ReactECharts from 'echarts-for-react';
import { FolderTree } from 'lucide-react';
import { Card, Skeleton, EmptyState } from '../../components/ui';
import { getChartColors, useThemeMode, effectiveLightDark } from '../../utils/themeColors';
import type { CategoryCount } from '../../types';

const BODY_H = 280;
const PALETTE_DARK = ['#9eb2ce', '#5cbf92', '#e69a3b', '#a78bfa', '#7eb6ff', '#f87171', '#a3a3a3'];
const PALETTE_LIGHT = ['#4a6797', '#047857', '#b16412', '#7c3aed', '#1d4ed8', '#b91c1c', '#6b7280'];

// 카테고리별 프로젝트 분포 — 좌측 도넛(중앙 총계) + 우측 카테고리 리스트. (개요)
export function CategoryBreakdownCard({ data, loading }: { data: CategoryCount[]; loading: boolean }) {
  const theme = useThemeMode();
  const ch = getChartColors(theme);
  const palette = effectiveLightDark(theme) === 'light' ? PALETTE_LIGHT : PALETTE_DARK;
  const total = data.reduce((n, c) => n + c.count, 0);

  return (
    <Card padding="normal">
      <h3 className="h-card flex items-center gap-2 mb-1">
        <FolderTree size={16} className="text-muted" />
        카테고리별 프로젝트
      </h3>
      <div style={{ height: BODY_H }}>
        {loading ? (
          <Skeleton height={BODY_H} />
        ) : total === 0 ? (
          <div className="h-full flex items-center justify-center">
            <EmptyState icon={<FolderTree size={28} />} title="프로젝트 없음" />
          </div>
        ) : (
          <div className="grid grid-cols-[140px_1fr] gap-3 items-center h-full">
            <div className="relative">
              <ReactECharts option={buildOption(data, palette, ch)} style={{ height: 150 }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold text-primary leading-none">{total}</span>
                <span className="text-[10px] text-muted mt-0.5">프로젝트</span>
              </div>
            </div>
            <ul className="space-y-1 max-h-full overflow-y-auto pr-1">
              {data.map((c, i) => (
                <li key={c.category} className="flex items-center gap-2 text-sm">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: palette[i % palette.length] }} />
                  <span className="text-secondary truncate flex-1 min-w-0">{c.category}</span>
                  <span className="text-xs text-muted tabular-nums shrink-0">{c.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function buildOption(data: CategoryCount[], palette: string[], ch: ReturnType<typeof getChartColors>) {
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => `${p.name}: ${p.value}개 (${p.percent}%)`,
      backgroundColor: ch.tooltipBg, borderColor: ch.tooltipBorder, textStyle: { color: ch.tooltipText },
    },
    legend: { show: false },
    series: [{
      type: 'pie',
      radius: ['58%', '78%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: true,
      label: { show: false },
      data: data.map((c, i) => ({ name: c.category, value: c.count, itemStyle: { color: palette[i % palette.length] } })),
    }],
  };
}
