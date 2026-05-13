import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, RefreshCw, Calendar, NotebookPen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { monitoringApi } from '../api/monitoring';
import { worklogApi } from '../api/worklog';
import type { TodayWbs, WeeklyWorkLog, WeeklyWorkLogDay, WeeklyWorkLogProject } from '../types';

type WorkLogField = 'done' | 'plan' | 'issues';
const FIELD_DEFS: { key: WorkLogField; label: string }[] = [
  { key: 'done',   label: '한 일' },
  { key: 'plan',   label: '계획' },
  { key: 'issues', label: '이슈' },
];

const statusLabel = { Planned: '예정', InProgress: '진행', Done: '완료' };
const statusBadge = {
  Planned: 'bg-zinc-700/40 text-slate-300',
  InProgress: 'bg-amber-500/15 text-amber-300',
  Done: 'bg-emerald-500/15 text-emerald-300',
};

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
        <h1 className="text-lg font-semibold text-primary flex items-center gap-2">
          <Activity size={18} className="text-accent" />
          통합 모니터링
        </h1>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 hover:bg-surface-3 text-secondary rounded-md text-sm">
          <RefreshCw size={14} /> 새로고침
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-900/40 border border-red-700/50 rounded-md text-red-300 text-sm">{error}</div>
      )}

      {/* === 오늘 진행 중 WBS === */}
      <section className="space-y-3">
        <div className="bg-surface border border-default rounded-lg p-4">
          <p className="text-xs text-muted flex items-center gap-2">
            <Calendar size={12} />
            {today} 기준 진행 중인 작업
          </p>
          <p className="text-2xl font-semibold text-primary mt-1">
            총 {items.length}건 / {grouped.length}개 프로젝트
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-muted">불러오는 중...</p>
        ) : grouped.length === 0 ? (
          <div className="text-center py-12 text-muted">
            <Activity size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">오늘 진행 중인 작업이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map((g) => (
              <div key={g.projectId} className="bg-surface border border-default rounded-lg overflow-hidden">
                <div
                  className="px-4 py-3 bg-surface-2 border-b border-default flex items-center justify-between cursor-pointer hover:bg-surface-3"
                  onClick={() => navigate(`/projects/${g.projectId}/wbs`)}
                >
                  <h2 className="text-sm font-semibold text-primary">{g.projectName}</h2>
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
                    {g.items.map((it) => (
                      <tr
                        key={it.wbsItemId}
                        className="border-b border-default last:border-0 hover:bg-surface-2 cursor-pointer"
                        onClick={() => navigate(`/projects/${it.projectId}/wbs`)}
                      >
                        <td className="py-2 px-4 text-sm text-primary">{it.wbsItemName}</td>
                        <td className="py-2 px-3 text-sm text-secondary">{it.assignee || '-'}</td>
                        <td className="py-2 px-3 text-xs text-muted">
                          {it.startDate?.slice(0, 10) ?? '-'} ~ {it.endDate?.slice(0, 10) ?? '-'}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`text-xs px-2 py-0.5 rounded ${statusBadge[it.status]}`}>
                            {statusLabel[it.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
  const emptyCls = muted
    ? 'bg-surface-2/40 border border-default/60 rounded-lg p-6 text-center text-muted text-sm'
    : 'bg-surface border border-default rounded-lg p-6 text-center text-muted text-sm';
  return (
    <section className="space-y-3">
      <h2 className={`text-base font-semibold flex items-center gap-2 ${titleCls}`}>
        <NotebookPen size={16} className={iconCls} />
        {title}
        {data && (
          <span className="text-xs text-muted font-normal">
            ({data.weekStart.slice(0, 10)} 주)
          </span>
        )}
      </h2>
      {loading ? (
        <p className="text-sm text-muted">불러오는 중...</p>
      ) : !data || data.projects.length === 0 ? (
        <div className={emptyCls}>
          기록 없음
        </div>
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
  const cardCls = variant === 'muted'
    ? 'bg-surface-2/40 border border-default/60 rounded-lg p-4 opacity-90'
    : 'bg-surface border border-default rounded-lg p-4';
  return (
    <div className={cardCls}>
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
    </div>
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
