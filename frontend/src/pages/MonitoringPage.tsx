import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, RefreshCw, Calendar, NotebookPen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { monitoringApi } from '../api/monitoring';
import { worklogApi } from '../api/worklog';
import type { TodayWbs, WeeklyWorkLog } from '../types';

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

      <WeeklySection title="이번 주 업무일지" data={thisWeek} loading={loading} onProjectClick={(id) => navigate(`/projects/${id}/worklog`)} />
      <WeeklySection title="지난 주 업무일지" data={lastWeek} loading={loading} onProjectClick={(id) => navigate(`/projects/${id}/worklog`)} />
    </div>
  );
}

function WeeklySection({
  title, data, loading, onProjectClick,
}: {
  title: string;
  data: WeeklyWorkLog | null;
  loading: boolean;
  onProjectClick: (id: number) => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-primary flex items-center gap-2">
        <NotebookPen size={16} className="text-accent" />
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
        <div className="bg-surface border border-default rounded-lg p-6 text-center text-muted text-sm">
          기록 없음
        </div>
      ) : (
        <div className="space-y-3">
          {data.projects.map((p) => (
            <div key={p.projectId} className="bg-surface border border-default rounded-lg p-4">
              <button
                onClick={() => onProjectClick(p.projectId)}
                className="text-base font-bold text-primary hover:text-accent transition-colors"
              >
                {p.projectName}
              </button>
              <div className="mt-2 space-y-2">
                {p.done && (
                  <div>
                    <p className="text-xs text-accent font-medium mb-1">한 일</p>
                    <div className="markdown-body pl-2"><ReactMarkdown>{p.done}</ReactMarkdown></div>
                  </div>
                )}
                {p.plan && (
                  <div>
                    <p className="text-xs text-accent font-medium mb-1">계획</p>
                    <div className="markdown-body pl-2"><ReactMarkdown>{p.plan}</ReactMarkdown></div>
                  </div>
                )}
                {p.issues && (
                  <div>
                    <p className="text-xs text-accent font-medium mb-1">이슈</p>
                    <div className="markdown-body pl-2"><ReactMarkdown>{p.issues}</ReactMarkdown></div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
