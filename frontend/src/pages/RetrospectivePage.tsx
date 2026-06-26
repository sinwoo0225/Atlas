/* eslint-disable @typescript-eslint/no-explicit-any */
// ECharts tooltip 이 복잡한 union 타입을 받아 이 파일 안에서만 any 허용 (TrendsTab 과 같은 관행).
import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { History, CalendarClock, Bug, Timer, TrendingUp } from 'lucide-react';
import { projectsApi } from '../api/projects';
import { retrospectiveApi } from '../api/retrospective';
import { Card, EmptyState, Skeleton, Badge } from '../components/ui';
import { getChartColors, useThemeMode } from '../utils/themeColors';
import type { Project, ProjectRetrospective, RetrospectiveData } from '../types';

const H = 300;
const MAX_SELECT = 8;
// 프로젝트별 범례 색 — 최대 8개. 다크/라이트 모두에서 식별 가능한 채도.
const PALETTE = ['#5b8def', '#ef6b6b', '#4ade80', '#f5b955', '#a78bfa', '#22d3ee', '#f472b6', '#94a3b8'];
type Ch = ReturnType<typeof getChartColors>;

function tip(ch: Ch) {
  return { backgroundColor: ch.tooltipBg, borderColor: ch.tooltipBorder, textStyle: { color: ch.tooltipText } };
}
function baseAxis(ch: Ch) {
  return {
    axisLine: { lineStyle: { color: ch.axisLine } },
    axisLabel: { color: ch.axisText, fontSize: 10 },
    splitLine: { lineStyle: { color: ch.splitLine } },
  };
}
const shortName = (v: string) => (v.length > 10 ? v.slice(0, 10) + '…' : v);

export function RetrospectivePage() {
  const { t } = useTranslation();
  const theme = useThemeMode();
  const ch = useMemo(() => getChartColors(theme), [theme]);

  const [doneProjects, setDoneProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [data, setData] = useState<RetrospectiveData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    projectsApi.getAll()
      .then((all) => setDoneProjects(all.filter((p) => p.status === 'Done')))
      .catch(() => setError(t('retrospective:error.loadProjects')));
  }, [t]);

  const load = useCallback(async (ids: number[]) => {
    if (ids.length === 0) { setData(null); return; }
    setLoading(true);
    try {
      setData(await retrospectiveApi.get(ids));
      setError('');
    } catch {
      setError(t('retrospective:error.load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(selected); }, [selected, load]);

  const toggle = (id: number) => {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_SELECT) return cur;
      return [...cur, id];
    });
  };

  const projects = useMemo(() => data?.projects ?? [], [data]);
  const colorOf = (i: number) => PALETTE[i % PALETTE.length];

  const delayOpt = useMemo(() => (projects.length ? delayOption(projects, ch, t, colorOf) : null), [projects, ch, t]);
  const issuesOpt = useMemo(() => (projects.length ? issuesOption(projects, ch, t) : null), [projects, ch, t]);
  const resolutionOpt = useMemo(() => (projects.length ? resolutionOption(projects, ch, t, colorOf) : null), [projects, ch, t]);
  const burnUpOpt = useMemo(() => (projects.length ? burnUpOption(projects, ch, t, colorOf) : null), [projects, ch, t]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="h-page flex items-center gap-2">
        <History size={18} className="text-muted" />
        {t('retrospective:title')}
      </h1>
      <p className="text-sm text-muted">{t('retrospective:subtitle')}</p>

      {error && (
        <div className="p-3 bg-danger-soft border border-default rounded-md text-on-danger text-sm">{error}</div>
      )}

      {/* 완료 프로젝트 다중 선택 */}
      <Card padding="normal">
        <h3 className="h-card mb-2">{t('retrospective:select.title', { count: selected.length, max: MAX_SELECT })}</h3>
        {doneProjects.length === 0 ? (
          <p className="text-sm text-muted">{t('retrospective:select.none')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {doneProjects.map((p) => {
              const on = selected.includes(p.id);
              const idx = selected.indexOf(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  disabled={!on && selected.length >= MAX_SELECT}
                  className={`px-3 py-1.5 rounded-md border text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    on ? 'border-strong text-primary' : 'border-default text-muted hover:text-secondary hover:border-strong'
                  }`}
                  style={on ? { borderColor: colorOf(idx), color: colorOf(idx) } : undefined}
                >
                  {on && <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: colorOf(idx) }} />}
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {selected.length === 0 ? (
        <EmptyState
          icon={<History size={36} />}
          title={t('retrospective:empty.title')}
          description={t('retrospective:empty.desc')}
        />
      ) : loading ? (
        <Skeleton height={H} />
      ) : (
        <>
          <SummaryTable projects={projects} colorOf={colorOf} t={t} />
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard icon={<CalendarClock size={16} />} title={t('retrospective:chart.delayTitle')} desc={t('retrospective:chart.delayDesc')}>
              {delayOpt && <ReactECharts option={delayOpt} style={{ height: H }} />}
            </ChartCard>
            <ChartCard icon={<TrendingUp size={16} />} title={t('retrospective:chart.burnTitle')} desc={t('retrospective:chart.burnDesc')}>
              {burnUpOpt && <ReactECharts option={burnUpOpt} style={{ height: H }} />}
            </ChartCard>
            <ChartCard icon={<Bug size={16} />} title={t('retrospective:chart.issuesTitle')} desc={t('retrospective:chart.issuesDesc')}>
              {issuesOpt && <ReactECharts option={issuesOpt} style={{ height: H }} />}
            </ChartCard>
            <ChartCard icon={<Timer size={16} />} title={t('retrospective:chart.resolutionTitle')} desc={t('retrospective:chart.resolutionDesc')}>
              {resolutionOpt && <ReactECharts option={resolutionOpt} style={{ height: H }} />}
            </ChartCard>
          </section>
        </>
      )}
    </div>
  );
}

function ChartCard({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <Card padding="normal">
      <h3 className="h-card flex items-center gap-2 mb-1">
        <span className="text-muted">{icon}</span>{title}
      </h3>
      {desc && <p className="text-[11px] text-muted leading-snug mb-2">{desc}</p>}
      <div style={{ height: H }}>{children}</div>
    </Card>
  );
}

function SummaryTable({ projects, colorOf, t }: { projects: ProjectRetrospective[]; colorOf: (i: number) => string; t: TFunction }) {
  return (
    <Card padding="normal">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-default text-muted text-xs">
              <th className="text-left py-2 px-2 font-medium">{t('retrospective:table.project')}</th>
              <th className="text-right py-2 px-2 font-medium">{t('retrospective:table.delay')}</th>
              <th className="text-right py-2 px-2 font-medium">{t('retrospective:table.wbsLate')}</th>
              <th className="text-right py-2 px-2 font-medium">{t('retrospective:table.startVar')}</th>
              <th className="text-right py-2 px-2 font-medium">{t('retrospective:table.onTimeStart')}</th>
              <th className="text-right py-2 px-2 font-medium">{t('retrospective:table.cycleTime')}</th>
              <th className="text-right py-2 px-2 font-medium">{t('retrospective:table.issues')}</th>
              <th className="text-right py-2 px-2 font-medium">{t('retrospective:table.density')}</th>
              <th className="text-right py-2 px-2 font-medium">{t('retrospective:table.resolution')}</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p, i) => (
              <tr key={p.projectId} className="border-b border-default last:border-0">
                <td className="py-2 px-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: colorOf(i) }} />
                    <span className="text-primary font-medium">{p.projectName}</span>
                  </span>
                </td>
                <td className="text-right py-2 px-2">
                  {p.scheduleDelayDays == null ? '-' : (
                    <span className={p.scheduleDelayDays > 0 ? 'text-on-danger' : 'text-on-success'}>
                      {p.scheduleDelayDays > 0 ? '+' : ''}{p.scheduleDelayDays}{t('retrospective:unit.day')}
                      {p.scheduleDelayRatio != null && ` (${Math.round(p.scheduleDelayRatio * 100)}%)`}
                    </span>
                  )}
                </td>
                <td className="text-right py-2 px-2 text-secondary">
                  {p.wbsLatePastPlannedEnd}/{p.wbsDone} ({Math.round(p.wbsLateRatio * 100)}%)
                </td>
                <td className="text-right py-2 px-2">
                  {p.avgStartVarianceDays == null ? '-' : (
                    <span className={p.avgStartVarianceDays > 0 ? 'text-on-warning' : 'text-on-success'}>
                      {p.avgStartVarianceDays > 0 ? '+' : ''}{p.avgStartVarianceDays}{t('retrospective:unit.day')}
                    </span>
                  )}
                </td>
                <td className="text-right py-2 px-2 text-secondary">{p.onTimeStartRatio == null ? '-' : `${Math.round(p.onTimeStartRatio * 100)}%`}</td>
                <td className="text-right py-2 px-2 text-secondary">{p.avgCycleTimeDays == null ? '-' : `${p.avgCycleTimeDays}${t('retrospective:unit.day')}`}</td>
                <td className="text-right py-2 px-2">
                  <span className="inline-flex items-center gap-1 justify-end">
                    {p.issuesTotal}
                    {p.issuesHigh > 0 && <Badge variant="danger" size="sm">H {p.issuesHigh}</Badge>}
                  </span>
                </td>
                <td className="text-right py-2 px-2 text-secondary">{p.issueDensity == null ? '-' : `${p.issueDensity}/${t('retrospective:unit.week')}`}</td>
                <td className="text-right py-2 px-2 text-secondary">{p.avgResolutionDays == null ? '-' : `${p.avgResolutionDays}${t('retrospective:unit.day')}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function delayOption(projects: ProjectRetrospective[], ch: Ch, t: TFunction, colorOf: (i: number) => string) {
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, ...tip(ch),
      formatter: (ps: any) => {
        const p = projects[ps[0].dataIndex as number];
        const ratio = p.scheduleDelayRatio != null ? Math.round(p.scheduleDelayRatio * 100) : null;
        return `${p.projectName}<br/>${t('retrospective:chart.delayTip', { days: p.scheduleDelayDays ?? '-', ratio: ratio ?? '-' })}`;
      },
    },
    grid: { left: 44, right: 14, top: 16, bottom: 28 },
    xAxis: { type: 'category', data: projects.map((p) => shortName(p.projectName)), ...baseAxis(ch) },
    yAxis: { type: 'value', name: t('retrospective:chart.delayDays'), nameTextStyle: { color: ch.axisText, fontSize: 9 }, ...baseAxis(ch) },
    series: [{
      type: 'bar', barWidth: '50%',
      data: projects.map((p, i) => ({ value: p.scheduleDelayDays ?? 0, itemStyle: { color: colorOf(i), borderRadius: [3, 3, 0, 0] } })),
    }],
  };
}

function issuesOption(projects: ProjectRetrospective[], ch: Ch, t: TFunction) {
  const high = t('retrospective:priority.high');
  const med = t('retrospective:priority.medium');
  const low = t('retrospective:priority.low');
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...tip(ch) },
    legend: { data: [high, med, low], textStyle: { color: ch.axisText, fontSize: 10 }, top: 0, right: 0 },
    grid: { left: 36, right: 14, top: 24, bottom: 28 },
    xAxis: { type: 'category', data: projects.map((p) => shortName(p.projectName)), ...baseAxis(ch) },
    yAxis: { type: 'value', minInterval: 1, ...baseAxis(ch) },
    series: [
      { name: high, type: 'bar', stack: 'iss', data: projects.map((p) => p.issuesHigh), itemStyle: { color: ch.ganttToday } },
      { name: med, type: 'bar', stack: 'iss', data: projects.map((p) => p.issuesMedium), itemStyle: { color: ch.ganttBarInProgress } },
      { name: low, type: 'bar', stack: 'iss', data: projects.map((p) => p.issuesLow), itemStyle: { color: ch.ganttBarDone, borderRadius: [3, 3, 0, 0] } },
    ],
  };
}

function resolutionOption(projects: ProjectRetrospective[], ch: Ch, t: TFunction, colorOf: (i: number) => string) {
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, ...tip(ch),
      formatter: (ps: any) => {
        const p = projects[ps[0].dataIndex as number];
        return `${p.projectName}<br/>${t('retrospective:chart.resolutionTip', { days: p.avgResolutionDays ?? '-', count: p.resolutionSampleCount })}`;
      },
    },
    grid: { left: 44, right: 14, top: 16, bottom: 28 },
    xAxis: { type: 'category', data: projects.map((p) => shortName(p.projectName)), ...baseAxis(ch) },
    yAxis: { type: 'value', name: t('retrospective:chart.resolutionDays'), nameTextStyle: { color: ch.axisText, fontSize: 9 }, ...baseAxis(ch) },
    series: [{
      type: 'bar', barWidth: '50%',
      data: projects.map((p, i) => ({ value: p.avgResolutionDays ?? 0, itemStyle: { color: colorOf(i), borderRadius: [3, 3, 0, 0] } })),
    }],
  };
}

function burnUpOption(projects: ProjectRetrospective[], ch: Ch, t: TFunction, colorOf: (i: number) => string) {
  const ideal = t('retrospective:chart.ideal');
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item', ...tip(ch),
      formatter: (p: any) => {
        const v = p.value as [number, number];
        return `${p.seriesName}<br/>${t('retrospective:chart.burnTip', { elapsed: Math.round(v[0]), done: Math.round(v[1]) })}`;
      },
    },
    legend: { data: [...projects.map((p) => p.projectName), ideal], textStyle: { color: ch.axisText, fontSize: 10 }, top: 0, type: 'scroll' },
    grid: { left: 40, right: 16, top: 30, bottom: 36 },
    xAxis: { type: 'value', min: 0, max: 100, name: t('retrospective:chart.elapsedPct'), nameLocation: 'middle', nameGap: 22, nameTextStyle: { color: ch.axisText, fontSize: 9 }, ...baseAxis(ch) },
    yAxis: { type: 'value', min: 0, max: 100, name: t('retrospective:chart.donePct'), nameTextStyle: { color: ch.axisText, fontSize: 9 }, ...baseAxis(ch) },
    series: [
      ...projects.map((p, i) => ({
        name: p.projectName, type: 'line', smooth: true, showSymbol: false,
        data: p.burnUp.map((pt) => [pt.elapsedPct, pt.donePct]),
        lineStyle: { color: colorOf(i), width: 2 }, itemStyle: { color: colorOf(i) },
      })),
      {
        name: ideal, type: 'line', showSymbol: false, silent: true,
        data: [[0, 0], [100, 100]],
        lineStyle: { color: ch.mutedBar, type: 'dashed', width: 1 },
      },
    ],
  };
}
