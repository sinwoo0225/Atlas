import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, RefreshCw, Calendar, NotebookPen, Download, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import ReactMarkdown from 'react-markdown';
import { monitoringApi } from '../api/monitoring';
import { worklogApi } from '../api/worklog';
import { loadSettings } from '../store/settings';
import { Button, Card, Badge, EmptyState, Skeleton, Spinner } from '../components/ui';
import { wbsStatusBadge } from '../utils/statusMaps';
import { MonitoringChartGrid } from './monitoring/MonitoringChartGrid';
import { DeadlineCalendar } from './monitoring/DeadlineCalendar';
import { KanbanBoard } from './monitoring/KanbanBoard';
import { MonitoringRiskCard } from './monitoring/MonitoringRiskCard';
import { StaleProjectsCard } from './monitoring/StaleProjectsCard';
import { AgingWipCard } from './monitoring/AgingWipCard';
import { CategoryBreakdownCard } from './monitoring/CategoryBreakdownCard';
import { OverviewKpiCard } from './monitoring/OverviewKpiCard';
import { PeopleTab } from './monitoring/PeopleTab';
import { AttentionFeedCard } from './monitoring/AttentionFeedCard';
import { PortfolioCard } from './monitoring/PortfolioCard';
import { TrendsTab } from './monitoring/TrendsTab';
import { WeeklyReviewCard } from './monitoring/WeeklyReviewCard';
import type {
  ActivityByProject,
  AgingWipItem,
  CategoryCount,
  ForecastBundle,
  MonitoringCharts as MonitoringChartsData,
  MonitoringRisk,
  MonitoringTrends,
  NextWeekPlanByProject,
  OpenIssuesByProject,
  ResourceHeatmap,
  CapacityHeatmap,
  AttentionFeed,
  PortfolioRollup,
  StaleProject,
  TodayWbs, WeeklyReview, WeeklyWorkLog, WeeklyWorkLogDay, WeeklyWorkLogProject,
  WorkloadOverview,
} from '../types';

// 통합 모니터링에는 '한 일'·'이슈'만 노출한다. '계획' 은 프로젝트별 업무일지에서 본다.
type WorkLogField = 'done' | 'issues';
const FIELD_DEFS: { key: WorkLogField; labelKey: string }[] = [
  { key: 'done',   labelKey: 'monitoring:fields.done' },
  { key: 'issues', labelKey: 'monitoring:fields.issues' },
];

type MonitoringTab = 'overview' | 'people' | 'trends' | 'tasks' | 'logs';
const TABS: { value: MonitoringTab; labelKey: string }[] = [
  { value: 'overview', labelKey: 'monitoring:tabs.overview' },
  { value: 'people',   labelKey: 'monitoring:tabs.people' },
  { value: 'trends',   labelKey: 'monitoring:tabs.trends' },
  { value: 'tasks',    labelKey: 'monitoring:tabs.tasks' },
  { value: 'logs',     labelKey: 'monitoring:tabs.logs' },
];
function isTab(v: string | null): v is MonitoringTab {
  return v === 'overview' || v === 'people' || v === 'trends' || v === 'tasks' || v === 'logs';
}

// '작업' 탭 내부 뷰 — 배열에 항목만 추가하면 확장.
type TaskView = 'list' | 'calendar' | 'kanban';
const TASK_VIEWS: { value: TaskView; labelKey: string }[] = [
  { value: 'list',     labelKey: 'monitoring:taskViews.list' },
  { value: 'calendar', labelKey: 'monitoring:taskViews.calendar' },
  { value: 'kanban',   labelKey: 'monitoring:taskViews.kanban' },
];
function isTaskView(v: string | null): v is TaskView {
  return v === 'list' || v === 'calendar' || v === 'kanban';
}

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const diff = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - diff);
  return date;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function MonitoringPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: MonitoringTab = isTab(searchParams.get('tab')) ? (searchParams.get('tab') as MonitoringTab) : 'overview';
  const setTab = (next: MonitoringTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'overview') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  // URL view 파라미터가 있으면 우선, 없으면 설정의 기본 보기.
  const viewParam = searchParams.get('view');
  const taskView: TaskView = isTaskView(viewParam) ? viewParam : loadSettings().defaultTaskView;
  const setTaskView = (next: TaskView) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', next); // 명시적 선택은 항상 파라미터로 고정 (기본값과 무관하게 유지).
    setSearchParams(params, { replace: true });
  };

  const [items, setItems] = useState<TodayWbs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [thisWeek, setThisWeek] = useState<WeeklyWorkLog | null>(null);
  const [lastWeek, setLastWeek] = useState<WeeklyWorkLog | null>(null);
  const [charts, setCharts] = useState<MonitoringChartsData | null>(null);
  const [heatmap, setHeatmap] = useState<ResourceHeatmap | null>(null);
  // 용량 히트맵 — 담당자 탭 첫 진입 시 지연 로드(시간 기반 가동률, 건수 히트맵과 별도).
  const [capacity, setCapacity] = useState<CapacityHeatmap | null>(null);
  const [capacityLoading, setCapacityLoading] = useState(false);
  const [activityByProject, setActivityByProject] = useState<ActivityByProject[]>([]);
  const [openIssues, setOpenIssues] = useState<OpenIssuesByProject[]>([]);
  const [nextWeekPlan, setNextWeekPlan] = useState<NextWeekPlanByProject[]>([]);
  const [risk, setRisk] = useState<MonitoringRisk | null>(null);
  const [attention, setAttention] = useState<AttentionFeed | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioRollup | null>(null);
  const [stale, setStale] = useState<StaleProject[]>([]);
  const [agingWip, setAgingWip] = useState<AgingWipItem[]>([]);
  const [workload, setWorkload] = useState<WorkloadOverview | null>(null);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  // Phase 2 추세 번들 — 추세/담당자 탭 첫 진입 시 지연 로드(완료 전이 재구성이 무거워 개요와 분리).
  const [trends, setTrends] = useState<MonitoringTrends | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  // Phase 3 예측 번들 — 추세 탭 '실험' 섹션 전용 지연 로드(CFD 가 무거워 담당자 탭은 미로드).
  const [forecast, setForecast] = useState<ForecastBundle | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  // 주간 회고 다이제스트 — '일지' 탭 첫 진입 시 지연 로드(완료 전이 재구성이 무거워 개요와 분리).
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const load = () => {
    setLoading(true);
    setTrends(null); // 새로고침 시 추세 번들도 무효화 → 해당 탭 재진입/체류 시 재로드
    setTrendsLoading(false);
    setForecast(null);
    setForecastLoading(false);
    setReview(null); // 새로고침 시 회고도 무효화 → '일지' 탭 재진입 시 재로드
    setReviewLoading(false);
    setCapacity(null); // 새로고침 시 용량도 무효화 → '담당자' 탭 재진입 시 재로드
    setCapacityLoading(false);
    const thisMon = startOfWeek(new Date());
    const lastMon = addDays(thisMon, -7);
    Promise.all([
      monitoringApi.getToday(),
      worklogApi.weeklyMonitoring(isoDate(thisMon)),
      worklogApi.weeklyMonitoring(isoDate(lastMon)),
      monitoringApi.getCharts(),
      monitoringApi.getResourceHeatmap(),
      monitoringApi.getActivityByProject(30),
      monitoringApi.openIssues(),
      monitoringApi.nextWeekPlan(isoDate(thisMon)),
      monitoringApi.getRisk(),
      monitoringApi.getStale(),
      monitoringApi.getAgingWip(),
      monitoringApi.getWorkload(),
      monitoringApi.getCategoryBreakdown(),
      monitoringApi.getAttention(),
      monitoringApi.getPortfolio(),
    ])
      .then(([today, thisW, lastW, ch, hm, abp, oi, nwp, rk, st, aw, wl, cat, att, pf]) => {
        setItems(today.items);
        setThisWeek(thisW);
        setLastWeek(lastW);
        setCharts(ch);
        setHeatmap(hm);
        setActivityByProject(abp);
        setOpenIssues(oi);
        setNextWeekPlan(nwp);
        setRisk(rk);
        setStale(st);
        setAgingWip(aw);
        setWorkload(wl);
        setCategories(cat);
        setAttention(att);
        setPortfolio(pf);
      })
      .catch(() => setError(t('monitoring:loadFailed')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // 추세/담당자 탭 첫 진입(또는 새로고침 후 재진입) 시 추세 번들 지연 로드.
  useEffect(() => {
    if ((tab === 'trends' || tab === 'people') && trends === null && !trendsLoading) {
      setTrendsLoading(true);
      monitoringApi.getTrends()
        .then(setTrends)
        .catch(() => { /* 추세는 보조 — 실패해도 페이지 유지 */ })
        .finally(() => setTrendsLoading(false));
    }
  }, [tab, trends, trendsLoading]);

  // 담당자 탭 첫 진입(또는 새로고침 후 재진입) 시 용량 히트맵 지연 로드.
  useEffect(() => {
    if (tab === 'people' && capacity === null && !capacityLoading) {
      setCapacityLoading(true);
      monitoringApi.getResourceCapacity()
        .then(setCapacity)
        .catch(() => { /* 용량은 보조 — 실패해도 페이지 유지 */ })
        .finally(() => setCapacityLoading(false));
    }
  }, [tab, capacity, capacityLoading]);

  // 추세 탭 '실험(Phase 3)' 섹션 — 예측 번들 지연 로드(추세 탭 전용).
  useEffect(() => {
    if (tab === 'trends' && forecast === null && !forecastLoading) {
      setForecastLoading(true);
      monitoringApi.getForecast()
        .then(setForecast)
        .catch(() => { /* 예측은 실험·보조 */ })
        .finally(() => setForecastLoading(false));
    }
  }, [tab, forecast, forecastLoading]);

  // '일지' 탭 첫 진입(또는 새로고침 후 재진입) 시 주간 회고 다이제스트 지연 로드.
  useEffect(() => {
    if (tab === 'logs' && review === null && !reviewLoading) {
      setReviewLoading(true);
      monitoringApi.getWeeklyReview()
        .then(setReview)
        .catch(() => { /* 회고는 보조 — 실패해도 일지 탭 유지 */ })
        .finally(() => setReviewLoading(false));
    }
  }, [tab, review, reviewLoading]);

  const grouped = useMemo(() => {
    const map = new Map<number, { projectName: string; items: TodayWbs[] }>();
    items.forEach((i) => {
      const existing = map.get(i.projectId);
      if (existing) existing.items.push(i);
      else map.set(i.projectId, { projectName: i.projectName, items: [i] });
    });
    return Array.from(map.entries()).map(([pid, v]) => ({
      projectId: pid, projectName: v.projectName, items: v.items,
    }));
  }, [items]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h-page flex items-center gap-2">
          <Activity size={18} className="text-muted" />
          {t('monitoring:title')}
        </h1>
        <Button variant="secondary" onClick={load} leadingIcon={<RefreshCw size={16} />}>{t('monitoring:refresh')}</Button>
      </div>

      {error && (
        <div className="p-3 bg-danger-soft border border-default rounded-md text-on-danger text-sm">{error}</div>
      )}

      <TabBar value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="space-y-4">
          <AttentionFeedCard data={attention} loading={loading} onSelectTab={(tb) => setTab(tb as MonitoringTab)} />
          <PortfolioCard data={portfolio} loading={loading} />
          <MonitoringRiskCard risk={risk} />
          <MonitoringChartGrid
            data={charts}
            activityByProject={activityByProject}
            loading={loading}
            onProjectClick={(id) => navigate(`/projects/${id}/dashboard`)}
            onActivityProjectClick={(id) => navigate(`/activity?projectId=${id}`)}
          >
            <CategoryBreakdownCard data={categories} loading={loading} />
            <OverviewKpiCard charts={charts} openIssues={openIssues} loading={loading} />
            <StaleProjectsCard data={stale} loading={loading} />
            <AgingWipCard data={agingWip} loading={loading} />
          </MonitoringChartGrid>
        </div>
      )}

      {tab === 'people' && (
        <PeopleTab
          workload={workload}
          heatmap={heatmap}
          capacity={capacity}
          capacityLoading={capacityLoading}
          loading={loading}
          assigneeThroughput={trends?.assigneeThroughput ?? null}
          assigneeCycleTime={trends?.assigneeCycleTime ?? []}
          trendsLoading={trendsLoading}
        />
      )}

      {tab === 'trends' && (
        <TrendsTab data={trends} loading={trendsLoading} forecast={forecast} forecastLoading={forecastLoading} />
      )}

      {tab === 'tasks' && (
        <section className="space-y-3">
          <TaskViewSwitch value={taskView} onChange={setTaskView} />
          {taskView === 'calendar' ? (
            <DeadlineCalendar />
          ) : taskView === 'kanban' ? (
            <KanbanBoard />
          ) : (
          <>
          <Card padding="normal">
            <p className="text-xs text-muted flex items-center gap-2">
              <Calendar size={12} />
              {t('monitoring:tasks.asOf', { date: today })}
            </p>
            <p className="text-2xl font-semibold text-primary mt-1">
              {t('monitoring:tasks.summary', { count: items.length, projects: grouped.length })}
            </p>
          </Card>

          {loading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <Card key={i} padding="none" className="overflow-hidden">
                  <div className="px-4 py-3 bg-surface-2 border-b border-default">
                    <Skeleton height={16} width="30%" />
                  </div>
                  <div className="p-4 space-y-2">
                    {[0, 1, 2].map((j) => <Skeleton key={j} height={14} />)}
                  </div>
                </Card>
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <EmptyState
              icon={<Activity size={32} />}
              title={t('monitoring:tasks.empty')}
            />
          ) : (
            <div className="space-y-3">
              {grouped.map((g) => (
                <Card key={g.projectId} padding="none" className="overflow-hidden">
                  <div
                    className="px-4 py-3 bg-surface-2 border-b border-default flex items-center justify-between cursor-pointer hover:bg-surface-3 transition-colors"
                    onClick={() => navigate(`/projects/${g.projectId}/wbs`)}
                  >
                    <h2 className="h-card">{g.projectName}</h2>
                    <span className="text-xs text-muted">{t('monitoring:countItems', { count: g.items.length })}</span>
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead>
                      <tr className="text-xs text-muted border-b border-default">
                        <th className="text-left py-2 px-4 font-medium">{t('monitoring:tasks.colName')}</th>
                        <th className="text-left py-2 px-3 font-medium">{t('monitoring:tasks.colAssignee')}</th>
                        <th className="text-left py-2 px-3 font-medium">{t('monitoring:tasks.colPeriod')}</th>
                        <th className="text-left py-2 px-3 font-medium">{t('monitoring:tasks.colStatus')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((it) => {
                        const status = wbsStatusBadge[it.status];
                        return (
                          <tr
                            key={it.wbsItemId}
                            className="border-b border-default last:border-0 hover:bg-surface-2 cursor-pointer transition-colors"
                            onClick={() => navigate(`/projects/${it.projectId}/wbs`)}
                          >
                            <td className="py-2 px-4 text-sm text-primary">{it.wbsItemName}</td>
                            <td className="py-2 px-3 text-sm text-secondary">{it.assignee || '-'}</td>
                            <td className="py-2 px-3 text-xs text-muted">
                              {it.startDate?.slice(0, 10) ?? '-'} ~ {it.endDate?.slice(0, 10) ?? '-'}
                            </td>
                            <td className="py-2 px-3">
                              <Badge variant={status.variant} size="sm">{t(status.labelKey)}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </Card>
              ))}
            </div>
          )}
          </>
          )}
        </section>
      )}

      {tab === 'logs' && (
        <div className="space-y-4">
          <WeeklyReviewCard review={review} loading={reviewLoading} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <WeeklySection
              title={t('monitoring:logs.lastWeek')}
              data={lastWeek}
              loading={loading}
              onProjectClick={(id) => navigate(`/projects/${id}/worklog`)}
              variant="muted"
              exportable
            />
            <WeeklySection
              title={t('monitoring:logs.thisWeek')}
              data={thisWeek}
              loading={loading}
              onProjectClick={(id) => navigate(`/projects/${id}/worklog`)}
              variant="current"
              exportable
              openIssues={openIssues}
              review={review}
              plan={nextWeekPlan}
            />
          </div>
          <OpenIssuesSection
            openIssues={openIssues}
            loading={loading}
            onProjectClick={(id) => navigate(`/projects/${id}/issues`)}
          />
        </div>
      )}
    </div>
  );
}

function TabBar({ value, onChange }: { value: MonitoringTab; onChange: (next: MonitoringTab) => void }) {
  const { t } = useTranslation();
  return (
    <div role="tablist" className="inline-flex rounded-md border border-default bg-surface p-0.5">
      {TABS.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(tab.value)}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              active
                ? 'bg-accent text-on-accent font-medium'
                : 'text-secondary hover:text-primary hover:bg-surface-2'
            }`}
          >
            {t(tab.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

// '작업' 탭 내부 뷰 전환 (리스트 / 캘린더 …). TabBar 와 동일 스타일.
function TaskViewSwitch({ value, onChange }: { value: TaskView; onChange: (next: TaskView) => void }) {
  const { t } = useTranslation();
  return (
    <div role="tablist" className="inline-flex rounded-md border border-default bg-surface p-0.5">
      {TASK_VIEWS.map((v) => {
        const active = v.value === value;
        return (
          <button
            key={v.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(v.value)}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              active
                ? 'bg-accent text-on-accent font-medium'
                : 'text-secondary hover:text-primary hover:bg-surface-2'
            }`}
          >
            {t(v.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

// 이슈 설명을 한 줄 요약으로 — 줄바꿈/연속 공백을 단일 공백으로 접음.
function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// 회고 다이제스트 섹션 — 완료한 항목 / 놓친 마감 / 다음 주 예정. md 내보내기 상단에 첨부.
function buildReviewMarkdown(review: WeeklyReview, t: TFunction): string {
  const due = t('monitoring:markdown.due');
  const lines: string[] = [`## ${t('monitoring:markdown.reviewHeading')}`, ''];
  const section = (heading: string, items: string[]) => {
    lines.push(`### ${heading} (${items.length})`);
    if (items.length === 0) lines.push(`- _${t('monitoring:markdown.none')}_`);
    else lines.push(...items);
    lines.push('');
  };
  section(t('monitoring:markdown.completed'), review.completed.map((c) => `- [${c.projectName}] ${c.title} (${c.completedAt})`));
  section(t('monitoring:markdown.missed'), review.missedDeadlines.map((d) => `- [${d.projectName}] ${d.title} — ${due} ${d.dueDate}`));
  section(t('monitoring:markdown.upcoming'), review.upcomingNextWeek.map((d) => `- [${d.projectName}] ${d.title} — ${due} ${d.dueDate}`));
  return lines.join('\n');
}

function buildWeeklyMarkdown(data: WeeklyWorkLog, t: TFunction, openIssues: OpenIssuesByProject[] = [], review: WeeklyReview | null = null, plan: NextWeekPlanByProject[] = []): string {
  const weekStart = data.weekStart.slice(0, 10);
  // 종료일 = 주 시작 + 4일 (월~금)
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 4);
  const endIso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

  const fields: { key: 'done' | 'issues'; label: string }[] = [
    { key: 'done',   label: t('monitoring:fields.done') },
    { key: 'issues', label: t('monitoring:fields.issues') },
  ];

  const lines: string[] = [];
  lines.push(`# ${t('monitoring:markdown.worklogTitle')} (${weekStart} ~ ${endIso})`);
  lines.push('');

  if (review) {
    lines.push(buildReviewMarkdown(review, t));
    lines.push('');
  }

  if (data.projects.length === 0) {
    lines.push(`_${t('monitoring:markdown.noRecord')}_`);
    lines.push('');
  } else {
    for (const p of data.projects) {
      lines.push(`## ${p.projectName}`);
      lines.push('');
      for (const d of p.days) {
        const hasAny = fields.some((f) => (d[f.key] ?? '').trim() !== '');
        if (!hasAny) continue;
        const dateShort = d.date.slice(5, 10).replace('-', '/');
        lines.push(`### ${d.dayLabel} (${dateShort})`);
        for (const f of fields) {
          const val = (d[f.key] ?? '').trim();
          if (!val) continue;
          lines.push(`**${f.label}**:`);
          lines.push('');
          lines.push(val);
          lines.push('');
        }
      }
    }
  }

  // 미해결 이슈 스냅샷 — '[프로젝트명] 이슈이름 - 이슈설명'.
  const issueLines = openIssues.flatMap((p) =>
    p.issues.map((i) => {
      const desc = oneLine(i.description);
      return `- [${p.projectName}] ${i.title}${desc ? ` - ${desc}` : ''}`;
    }),
  );
  if (issueLines.length > 0) {
    lines.push(`## ${t('monitoring:markdown.issuesTitle')}`);
    lines.push('');
    lines.push(...issueLines);
    lines.push('');
  }

  // 다음 주 계획 — '[프로젝트명] 제목 — 시작/마감 날짜 (담당자)'.
  const planLines = plan.flatMap((p) =>
    p.items.map((it) => {
      const reason = it.reason === 'start' ? t('monitoring:markdown.planStart') : t('monitoring:markdown.planDue');
      const who = it.assigneeName ? ` (${it.assigneeName})` : '';
      return `- [${p.projectName}] ${it.title} — ${reason} ${it.date}${who}`;
    }),
  );
  if (planLines.length > 0) {
    lines.push(`## ${t('monitoring:markdown.planTitle')}`);
    lines.push('');
    lines.push(...planLines);
    lines.push('');
  }
  return lines.join('\n');
}

function downloadWeeklyMarkdown(data: WeeklyWorkLog, t: TFunction, openIssues: OpenIssuesByProject[] = [], review: WeeklyReview | null = null, plan: NextWeekPlanByProject[] = []) {
  const md = buildWeeklyMarkdown(data, t, openIssues, review, plan);
  const weekStart = data.weekStart.slice(0, 10);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `worklog-${weekStart}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type WeeklyVariant = 'current' | 'muted';

function WeeklySection({
  title, data, loading, onProjectClick, variant = 'current', exportable = false, openIssues = [], review = null, plan = [],
}: {
  title: string;
  data: WeeklyWorkLog | null;
  loading: boolean;
  onProjectClick: (id: number) => void;
  variant?: WeeklyVariant;
  exportable?: boolean;
  openIssues?: OpenIssuesByProject[];
  review?: WeeklyReview | null;
  plan?: NextWeekPlanByProject[];
}) {
  const { t } = useTranslation();
  const muted = variant === 'muted';
  const titleCls = muted ? 'text-secondary' : 'text-primary';
  const iconCls = muted ? 'text-muted' : 'text-accent';
  const reviewHasContent = !!review
    && review.completed.length + review.missedDeadlines.length + review.upcomingNextWeek.length > 0;
  const planHasContent = plan.some((p) => p.items.length > 0);
  const hasLogs = !!data && data.projects.length > 0;
  const canExport = exportable && !!data && (hasLogs || reviewHasContent || planHasContent);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className={`h-section flex items-center gap-2 ${titleCls}`}>
          <NotebookPen size={16} className={iconCls} />
          {title}
          {data && (
            <span className="text-xs text-muted font-normal">
              {t('monitoring:weekSuffix', { date: data.weekStart.slice(0, 10) })}
            </span>
          )}
        </h2>
        {canExport && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadWeeklyMarkdown(data!, t, openIssues, review, plan)}
            leadingIcon={<Download size={14} />}
            title={t('monitoring:logs.exportTitle')}
          >
            {t('monitoring:logs.export')}
          </Button>
        )}
      </div>
      {loading ? (
        <Spinner label={t('common:loading')} />
      ) : (
        <div className="space-y-3">
          {hasLogs ? (
            data!.projects.map((p) => (
              <ProjectWeekCard key={p.projectId} project={p} onProjectClick={onProjectClick} variant={variant} />
            ))
          ) : (
            <Card padding="spacious" variant={muted ? 'subtle' : 'default'} className="text-center text-muted text-sm">
              {t('monitoring:logs.noRecord')}
            </Card>
          )}
          {planHasContent && <NextWeekPlanBlock plan={plan} onProjectClick={onProjectClick} />}
        </div>
      )}
    </section>
  );
}

// 다음 주 계획 — 프로젝트별 다음 주 시작/마감 예정 작업·이슈. '이번 주' 주간 병합에 첨부.
function NextWeekPlanBlock({ plan, onProjectClick }: {
  plan: NextWeekPlanByProject[];
  onProjectClick: (id: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card padding="normal" variant="subtle">
      <p className="h-section flex items-center gap-2 text-primary mb-2">
        <Calendar size={16} className="text-accent" />
        {t('monitoring:logs.planTitle')}
      </p>
      <div className="space-y-3">
        {plan.map((p) => (
          <div key={p.projectId}>
            <button
              onClick={() => onProjectClick(p.projectId)}
              className="text-sm font-bold text-primary hover:text-accent transition-colors"
            >
              {p.projectName}
            </button>
            <ul className="mt-1 space-y-1">
              {p.items.map((it) => (
                <li key={`${it.kind}-${it.id}`} className="text-sm text-secondary flex flex-wrap items-baseline gap-x-1.5">
                  <Badge variant={it.reason === 'start' ? 'accent' : 'warning'} size="sm">
                    {it.reason === 'start' ? t('monitoring:logs.planStart') : t('monitoring:logs.planDue')}
                  </Badge>
                  <span className="font-medium text-primary">{it.title}</span>
                  <span className="text-muted">{it.date}</span>
                  {it.assigneeName && <Badge variant="neutral" size="sm">{it.assigneeName}</Badge>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ProjectWeekCard({
  project, onProjectClick, variant = 'current',
}: {
  project: WeeklyWorkLogProject;
  onProjectClick: (id: number) => void;
  variant?: WeeklyVariant;
}) {
  const { t } = useTranslation();
  return (
    <Card padding="normal" variant={variant === 'muted' ? 'subtle' : 'default'} className={variant === 'muted' ? 'opacity-90' : ''}>
      <button
        onClick={() => onProjectClick(project.projectId)}
        className="text-base font-bold text-primary hover:text-accent transition-colors"
      >
        {project.projectName}
      </button>
      <div className="mt-2 space-y-3">
        {FIELD_DEFS.map((f) => {
          const daysWithContent = project.days.filter((d) => (d[f.key] ?? '').trim() !== '');
          if (daysWithContent.length === 0) return null;
          return (
            <div key={f.key}>
              <p className="text-xs text-accent font-medium mb-1">{t(f.labelKey)}</p>
              <div className="pl-2 space-y-2">
                {daysWithContent.map((d) => (
                  <DayBlock key={d.dayIndex} day={d} field={f.key} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DayBlock({ day, field }: { day: WeeklyWorkLogDay; field: WorkLogField }) {
  return (
    <div>
      <p className="text-xs font-semibold text-secondary">{day.dayLabel}</p>
      <div className="markdown-body pl-3"><ReactMarkdown>{day[field]}</ReactMarkdown></div>
    </div>
  );
}

// 미해결(Open·InProgress) 이슈를 프로젝트별로 묶어 보여주는 섹션. md 내보내기엔 '이번 주' 일지에 첨부됨.
function OpenIssuesSection({
  openIssues, loading, onProjectClick,
}: {
  openIssues: OpenIssuesByProject[];
  loading: boolean;
  onProjectClick: (id: number) => void;
}) {
  const { t } = useTranslation();
  const total = openIssues.reduce((n, p) => n + p.issues.length, 0);
  return (
    <section className="space-y-3">
      <h2 className="h-section flex items-center gap-2 text-primary">
        <AlertCircle size={16} className="text-accent" />
        {t('monitoring:logs.issuesTitle')}
        <span className="text-xs text-muted font-normal">{t('monitoring:logs.openCount', { count: total })}</span>
      </h2>
      {loading ? (
        <Spinner label={t('common:loading')} />
      ) : openIssues.length === 0 ? (
        <Card padding="spacious" className="text-center text-muted text-sm">
          {t('monitoring:logs.noOpenIssues')}
        </Card>
      ) : (
        <div className="space-y-3">
          {openIssues.map((p) => (
            <Card key={p.projectId} padding="normal">
              <button
                onClick={() => onProjectClick(p.projectId)}
                className="text-base font-bold text-primary hover:text-accent transition-colors"
              >
                {p.projectName}
              </button>
              <ul className="mt-2 space-y-1">
                {p.issues.map((i) => (
                  <li key={i.id} className="text-sm text-secondary flex flex-wrap items-baseline gap-x-1.5">
                    <span className="font-medium text-primary">{i.title}</span>
                    {i.description.trim() && (
                      <span className="text-muted">- {i.description.replace(/\s+/g, ' ').trim()}</span>
                    )}
                    {i.assigneeName && (
                      <Badge variant="neutral" size="sm">{i.assigneeName}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
