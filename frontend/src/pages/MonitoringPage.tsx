import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, RefreshCw, Calendar, NotebookPen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { monitoringApi } from '../api/monitoring';
import { worklogApi } from '../api/worklog';
import { Button, Card, Badge, EmptyState, Skeleton, Spinner } from '../components/ui';
import { wbsStatusBadge } from '../utils/statusMaps';
import type { TodayWbs, WeeklyWorkLog, WeeklyWorkLogDay, WeeklyWorkLogProject } from '../types';

type WorkLogField = 'done' | 'plan' | 'issues';
const FIELD_DEFS: { key: WorkLogField; label: string }[] = [
  { key: 'done',   label: '한 일' },
  { key: 'plan',   label: '계획' },
  { key: 'issues', label: '이슈' },
];

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
  const [items, setItems] = useState<TodayWbs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [thisWeek, setThisWeek] = useState<WeeklyWorkLog | null>(null);
  const [lastWeek, setLastWeek] = useState<WeeklyWorkLog | null>(null);

  const load = () => {
    setLoading(true);
    const thisMon = startOfWeek(new Date());
    const lastMon = addDays(thisMon, -7);
    Promise.all([
      monitoringApi.getToday(),
      worklogApi.weeklyMonitoring(isoDate(thisMon)),
      worklogApi.weeklyMonitoring(isoDate(lastMon)),
    ])
      .then(([today, thisW, lastW]) => {
        setItems(today.items);
        setThisWeek(thisW);
        setLastWeek(lastW);
      })
      .catch(() => setError('모니터링 데이터를 불러올 수 없습니다.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

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
    <div className="p-6 space-y-6">
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

      {/* === 오늘 진행 중 WBS === */}
      <section className="space-y-3">
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
                <table className="w-full">
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
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <WeeklySection
          title="지난 주 업무일지"
          data={lastWeek}
          loading={loading}
          onProjectClick={(id) => navigate(`/projects/${id}/worklog`)}
          variant="muted"
        />
        <WeeklySection
          title="이번 주 업무일지"
          data={thisWeek}
          loading={loading}
          onProjectClick={(id) => navigate(`/projects/${id}/worklog`)}
          variant="current"
        />
      </div>
    </div>
  );
}

type WeeklyVariant = 'current' | 'muted';

function WeeklySection({
  title, data, loading, onProjectClick, variant = 'current',
}: {
  title: string;
  data: WeeklyWorkLog | null;
  loading: boolean;
  onProjectClick: (id: number) => void;
  variant?: WeeklyVariant;
}) {
  const muted = variant === 'muted';
  const titleCls = muted ? 'text-secondary' : 'text-primary';
  const iconCls = muted ? 'text-muted' : 'text-accent';
  return (
    <section className="space-y-3">
      <h2 className={`h-section flex items-center gap-2 ${titleCls}`}>
        <NotebookPen size={16} className={iconCls} />
        {title}
        {data && (
          <span className="text-xs text-muted font-normal">
            ({data.weekStart.slice(0, 10)} 주)
          </span>
        )}
      </h2>
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
