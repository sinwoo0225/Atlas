import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, RefreshCw, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { monitoringApi } from '../api/monitoring';
import { worklogApi } from '../api/worklog';
import { loadSettings } from '../store/settings';
import { isFavorite, toggleFavorite, FAVORITES_EVENT } from '../utils/menuFavorites';
import { FavoriteStar } from '../components/FavoriteStar';
import { Button, Card, Badge, EmptyState, Skeleton } from '../components/ui';
import { wbsStatusBadge } from '../utils/statusMaps';
import {
  MonitoringChartGrid,
  StatusBreakdownCard,
  IssueMatrixCard,
  MilestoneCard,
  ActivityByProjectCard,
  WbsProgressCard,
} from './monitoring/MonitoringChartGrid';
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
import { WeeklySection, OpenIssuesSection } from './monitoring/WeeklySection';
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
  TodayWbs, WeeklyReview, WeeklyWorkLog,
  WorkloadOverview,
} from '../types';

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

  // 현재 탭/뷰를 메뉴 즐겨찾기로 토글 (예: '/monitoring?tab=tasks&view=kanban'). 라벨=모니터링 · 탭[· 뷰].
  const [favVersion, setFavVersion] = useState(0);
  useEffect(() => {
    const on = () => setFavVersion((v) => v + 1);
    window.addEventListener(FAVORITES_EVENT, on);
    return () => window.removeEventListener(FAVORITES_EVENT, on);
  }, []);
  const qs = searchParams.toString();
  const currentHref = `/monitoring${qs ? `?${qs}` : ''}`;
  // favVersion 은 즐겨찾기 토글(이벤트) 시 재평가를 위한 의도적 의존성.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const currentViewFav = useMemo(() => isFavorite(currentHref), [currentHref, favVersion]);
  const toggleCurrentViewFav = () => {
    const tabLabel = t(TABS.find((x) => x.value === tab)?.labelKey ?? 'monitoring:tabs.overview');
    const viewLabel = tab === 'tasks' ? ` · ${t(TASK_VIEWS.find((v) => v.value === taskView)?.labelKey ?? '')}` : '';
    toggleFavorite({ href: currentHref, iconSlot: '/monitoring', label: `${t('monitoring:title')} · ${tabLabel}${viewLabel}` });
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
    const weeklyMode = loadSettings().weeklyWorkLogMode;
    Promise.all([
      monitoringApi.getToday(),
      worklogApi.weeklyMonitoring(isoDate(thisMon), weeklyMode),
      worklogApi.weeklyMonitoring(isoDate(lastMon), weeklyMode),
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

      <div className="flex items-center gap-1">
        <TabBar value={tab} onChange={setTab} />
        <FavoriteStar
          active={currentViewFav}
          onToggle={toggleCurrentViewFav}
          className={currentViewFav ? '' : 'opacity-70 hover:opacity-100'}
        />
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          {/* 상단: 좌=포트폴리오(넓게) · 우=주의(좁게) 한 행. 카드를 그리드 셀로 직접 두어
              기본 stretch 정렬로 두 카드 높이를 더 높은 쪽에 맞춤. */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <PortfolioCard className="lg:col-span-2" data={portfolio} loading={loading} />
            <AttentionFeedCard data={attention} loading={loading} onSelectTab={(tb) => setTab(tb as MonitoringTab)} />
          </div>
          <MonitoringRiskCard risk={risk} />
          {/* 하단 9개 카드 3×3: 행1=포트폴리오 요약 / 행2=진척·일정 / 행3=리스크·흐름 */}
          <MonitoringChartGrid>
            <OverviewKpiCard charts={charts} openIssues={openIssues} loading={loading} />
            <StatusBreakdownCard data={charts} loading={loading} onProjectClick={(id) => navigate(`/projects/${id}/dashboard`)} />
            <CategoryBreakdownCard data={categories} loading={loading} />
            <WbsProgressCard data={charts} loading={loading} onProjectClick={(id) => navigate(`/projects/${id}/dashboard`)} />
            <ActivityByProjectCard activityByProject={activityByProject} loading={loading} onActivityProjectClick={(id) => navigate(`/activity?projectId=${id}`)} />
            <MilestoneCard data={charts} loading={loading} />
            <IssueMatrixCard data={charts} loading={loading} />
            <AgingWipCard data={agingWip} loading={loading} />
            <StaleProjectsCard data={stale} loading={loading} />
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

