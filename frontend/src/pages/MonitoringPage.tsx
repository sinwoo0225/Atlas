import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, RefreshCw, Calendar, NotebookPen, Download, AlertCircle } from 'lucide-react';
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
import { TrendsTab } from './monitoring/TrendsTab';
import type {
  ActivityByProject,
  AgingWipItem,
  CategoryCount,
  MonitoringCharts as MonitoringChartsData,
  MonitoringRisk,
  MonitoringTrends,
  OpenIssuesByProject,
  ResourceHeatmap,
  StaleProject,
  TodayWbs, WeeklyWorkLog, WeeklyWorkLogDay, WeeklyWorkLogProject,
  WorkloadOverview,
} from '../types';

// 통합 모니터링에는 '한 일'·'이슈'만 노출한다. '계획' 은 프로젝트별 업무일지에서 본다.
type WorkLogField = 'done' | 'issues';
const FIELD_DEFS: { key: WorkLogField; label: string }[] = [
  { key: 'done',   label: '한 일' },
  { key: 'issues', label: '이슈' },
];

type MonitoringTab = 'overview' | 'people' | 'trends' | 'tasks' | 'logs';
const TABS: { value: MonitoringTab; label: string }[] = [
  { value: 'overview', label: '개요' },
  { value: 'people',   label: '담당자' },
  { value: 'trends',   label: '추세' },
  { value: 'tasks',    label: '작업' },
  { value: 'logs',     label: '일지' },
];
function isTab(v: string | null): v is MonitoringTab {
  return v === 'overview' || v === 'people' || v === 'trends' || v === 'tasks' || v === 'logs';
}

// '작업' 탭 내부 뷰 — 배열에 항목만 추가하면 확장.
type TaskView = 'list' | 'calendar' | 'kanban';
const TASK_VIEWS: { value: TaskView; label: string }[] = [
  { value: 'list',     label: '리스트' },
  { value: 'calendar', label: '캘린더' },
  { value: 'kanban',   label: '칸반' },
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
  const [activityByProject, setActivityByProject] = useState<ActivityByProject[]>([]);
  const [openIssues, setOpenIssues] = useState<OpenIssuesByProject[]>([]);
  const [risk, setRisk] = useState<MonitoringRisk | null>(null);
  const [stale, setStale] = useState<StaleProject[]>([]);
  const [agingWip, setAgingWip] = useState<AgingWipItem[]>([]);
  const [workload, setWorkload] = useState<WorkloadOverview | null>(null);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  // Phase 2 추세 번들 — 추세/담당자 탭 첫 진입 시 지연 로드(완료 전이 재구성이 무거워 개요와 분리).
  const [trends, setTrends] = useState<MonitoringTrends | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(false);

  const load = () => {
    setLoading(true);
    setTrends(null); // 새로고침 시 추세 번들도 무효화 → 해당 탭 재진입/체류 시 재로드
    setTrendsLoading(false);
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
      monitoringApi.getRisk(),
      monitoringApi.getStale(),
      monitoringApi.getAgingWip(),
      monitoringApi.getWorkload(),
      monitoringApi.getCategoryBreakdown(),
    ])
      .then(([today, thisW, lastW, ch, hm, abp, oi, rk, st, aw, wl, cat]) => {
        setItems(today.items);
        setThisWeek(thisW);
        setLastWeek(lastW);
        setCharts(ch);
        setHeatmap(hm);
        setActivityByProject(abp);
        setOpenIssues(oi);
        setRisk(rk);
        setStale(st);
        setAgingWip(aw);
        setWorkload(wl);
        setCategories(cat);
      })
      .catch(() => setError('모니터링 데이터를 불러올 수 없습니다.'))
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
          통합 모니터링
        </h1>
        <Button variant="secondary" onClick={load} leadingIcon={<RefreshCw size={16} />}>새로고침</Button>
      </div>

      {error && (
        <div className="p-3 bg-danger-soft border border-default rounded-md text-on-danger text-sm">{error}</div>
      )}

      <TabBar value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="space-y-4">
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
          loading={loading}
          assigneeThroughput={trends?.assigneeThroughput ?? null}
          assigneeCycleTime={trends?.assigneeCycleTime ?? []}
          trendsLoading={trendsLoading}
        />
      )}

      {tab === 'trends' && (
        <TrendsTab data={trends} loading={trendsLoading} />
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
              {today} 기준 진행 중인 작업
            </p>
            <p className="text-2xl font-semibold text-primary mt-1">
              총 {items.length}건 / {grouped.length}개 프로젝트
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
              title="오늘 진행 중인 작업이 없습니다."
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
                    <span className="text-xs text-muted">{g.items.length}건</span>
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead>
                      <tr className="text-xs text-muted border-b border-default">
                        <th className="text-left py-2 px-4 font-medium">작업명</th>
                        <th className="text-left py-2 px-3 font-medium">담당자</th>
                        <th className="text-left py-2 px-3 font-medium">기간</th>
                        <th className="text-left py-2 px-3 font-medium">상태</th>
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
                              <Badge variant={status.variant} size="sm">{status.label}</Badge>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <WeeklySection
              title="지난 주 업무일지"
              data={lastWeek}
              loading={loading}
              onProjectClick={(id) => navigate(`/projects/${id}/worklog`)}
              variant="muted"
              exportable
            />
            <WeeklySection
              title="이번 주 업무일지"
              data={thisWeek}
              loading={loading}
              onProjectClick={(id) => navigate(`/projects/${id}/worklog`)}
              variant="current"
              exportable
              openIssues={openIssues}
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
  return (
    <div role="tablist" className="inline-flex rounded-md border border-default bg-surface p-0.5">
      {TABS.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(t.value)}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              active
                ? 'bg-accent text-on-accent font-medium'
                : 'text-secondary hover:text-primary hover:bg-surface-2'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// '작업' 탭 내부 뷰 전환 (리스트 / 캘린더 …). TabBar 와 동일 스타일.
function TaskViewSwitch({ value, onChange }: { value: TaskView; onChange: (next: TaskView) => void }) {
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
            {v.label}
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

function buildWeeklyMarkdown(data: WeeklyWorkLog, openIssues: OpenIssuesByProject[] = []): string {
  const weekStart = data.weekStart.slice(0, 10);
  // 종료일 = 주 시작 + 4일 (월~금)
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 4);
  const endIso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

  const fields: { key: 'done' | 'plan' | 'issues'; label: string }[] = [
    { key: 'done',   label: '한 일' },
    { key: 'plan',   label: '계획' },
    { key: 'issues', label: '이슈' },
  ];

  const lines: string[] = [];
  lines.push(`# 업무일지 (${weekStart} ~ ${endIso})`);
  lines.push('');

  if (data.projects.length === 0) {
    lines.push('_(기록 없음)_');
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
    lines.push('## 이슈 목록');
    lines.push('');
    lines.push(...issueLines);
    lines.push('');
  }
  return lines.join('\n');
}

function downloadWeeklyMarkdown(data: WeeklyWorkLog, openIssues: OpenIssuesByProject[] = []) {
  const md = buildWeeklyMarkdown(data, openIssues);
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
  title, data, loading, onProjectClick, variant = 'current', exportable = false, openIssues = [],
}: {
  title: string;
  data: WeeklyWorkLog | null;
  loading: boolean;
  onProjectClick: (id: number) => void;
  variant?: WeeklyVariant;
  exportable?: boolean;
  openIssues?: OpenIssuesByProject[];
}) {
  const muted = variant === 'muted';
  const titleCls = muted ? 'text-secondary' : 'text-primary';
  const iconCls = muted ? 'text-muted' : 'text-accent';
  const canExport = exportable && data && data.projects.length > 0;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className={`h-section flex items-center gap-2 ${titleCls}`}>
          <NotebookPen size={16} className={iconCls} />
          {title}
          {data && (
            <span className="text-xs text-muted font-normal">
              ({data.weekStart.slice(0, 10)} 주)
            </span>
          )}
        </h2>
        {canExport && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadWeeklyMarkdown(data!, openIssues)}
            leadingIcon={<Download size={14} />}
            title="md 파일로 내보내기 (미해결 이슈 목록 포함)"
          >
            md 내보내기
          </Button>
        )}
      </div>
      {loading ? (
        <Spinner label="불러오는 중..." />
      ) : !data || data.projects.length === 0 ? (
        <Card padding="spacious" variant={muted ? 'subtle' : 'default'} className="text-center text-muted text-sm">
          기록 없음
        </Card>
      ) : (
        <div className="space-y-3">
          {data.projects.map((p) => (
            <ProjectWeekCard key={p.projectId} project={p} onProjectClick={onProjectClick} variant={variant} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectWeekCard({
  project, onProjectClick, variant = 'current',
}: {
  project: WeeklyWorkLogProject;
  onProjectClick: (id: number) => void;
  variant?: WeeklyVariant;
}) {
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
              <p className="text-xs text-accent font-medium mb-1">{f.label}</p>
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
  const total = openIssues.reduce((n, p) => n + p.issues.length, 0);
  return (
    <section className="space-y-3">
      <h2 className="h-section flex items-center gap-2 text-primary">
        <AlertCircle size={16} className="text-accent" />
        이슈 목록
        <span className="text-xs text-muted font-normal">(미해결 {total}건)</span>
      </h2>
      {loading ? (
        <Spinner label="불러오는 중..." />
      ) : openIssues.length === 0 ? (
        <Card padding="spacious" className="text-center text-muted text-sm">
          미해결 이슈 없음
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
