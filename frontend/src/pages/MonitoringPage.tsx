import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, RefreshCw, Calendar } from 'lucide-react';
import { monitoringApi } from '../api/monitoring';
import type { TodayWbs } from '../types';

const statusLabel = { Planned: '예정', InProgress: '진행', Done: '완료' };
const statusBadge = {
  Planned: 'bg-zinc-700/40 text-slate-300',
  InProgress: 'bg-amber-500/15 text-amber-300',
  Done: 'bg-emerald-500/15 text-emerald-300',
};

export function MonitoringPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<TodayWbs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    monitoringApi.getToday()
      .then((d) => setItems(d.items))
      .catch(() => setError('모니터링 데이터를 불러올 수 없습니다.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // 프로젝트별 그룹화
  const grouped = useMemo(() => {
    const map = new Map<number, { projectName: string; items: TodayWbs[] }>();
    items.forEach((i) => {
      const existing = map.get(i.projectId);
      if (existing) existing.items.push(i);
      else map.set(i.projectId, { projectName: i.projectName, items: [i] });
    });
    return Array.from(map.entries()).map(([pid, v]) => ({
      projectId: pid,
      projectName: v.projectName,
      items: v.items,
    }));
  }, [items]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <Activity size={18} className="text-slate-400" />
          통합 모니터링
        </h1>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-slate-200 rounded-md text-sm transition-colors"
        >
          <RefreshCw size={14} /> 새로고침
        </button>
      </div>

      <div className="bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg p-4">
        <p className="text-xs text-slate-400 flex items-center gap-2">
          <Calendar size={12} />
          {today} 기준 진행 중인 작업
        </p>
        <p className="text-2xl font-semibold text-slate-100 mt-1">
          총 {items.length}건 / {grouped.length}개 프로젝트
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-900/40 border border-red-700/50 rounded-md text-red-300 text-sm">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Activity size={36} className="mx-auto mb-2 text-slate-600" />
          <p className="text-sm">오늘 진행 중인 작업이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <div key={g.projectId} className="bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg overflow-hidden">
              <div
                className="px-4 py-3 bg-zinc-800/40 border-b border-[#2a2a2a] flex items-center justify-between cursor-pointer hover:bg-zinc-800/60"
                onClick={() => navigate(`/projects/${g.projectId}/wbs`)}
              >
                <h2 className="text-sm font-semibold text-slate-100">{g.projectName}</h2>
                <span className="text-xs text-slate-400">{g.items.length}건</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-slate-400 border-b border-[#2a2a2a]">
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
                      className="border-b border-[#2a2a2a] last:border-0 hover:bg-zinc-800/30 cursor-pointer"
                      onClick={() => navigate(`/projects/${it.projectId}/wbs`)}
                    >
                      <td className="py-2 px-4 text-sm text-slate-200">{it.wbsItemName}</td>
                      <td className="py-2 px-3 text-sm text-slate-300">{it.assignee || '-'}</td>
                      <td className="py-2 px-3 text-xs text-slate-400">
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
    </div>
  );
}
