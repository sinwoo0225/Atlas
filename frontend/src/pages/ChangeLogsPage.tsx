import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { Plus, Pencil, X, Save, GitBranch } from 'lucide-react';
import { changeLogsApi } from '../api/changelogs';
import { meetingsApi } from '../api/meetings';
import type { ChangeLog, ImpactLevel, Meeting } from '../types';

const impactBg: Record<ImpactLevel, string> = {
  Low: 'bg-emerald-500/15 text-emerald-300',
  Medium: 'bg-amber-500/15 text-amber-300',
  High: 'bg-orange-500/15 text-orange-300',
  Critical: 'bg-red-500/15 text-red-300',
};

const impactColor: Record<ImpactLevel, string> = {
  Low: '#34d399',
  Medium: '#fbbf24',
  High: '#fb923c',
  Critical: '#f87171',
};

// 영향도 분포 + 일자별 차트 (히트맵 대신 stacked bar chart 사용)
function ImpactBarChart({ logs }: { logs: ChangeLog[] }) {
  if (logs.length === 0) return null;

  // 날짜별로 영향도별 카운트 집계
  const byDate: Record<string, Record<ImpactLevel, number>> = {};
  logs.forEach((log) => {
    const d = log.date.slice(0, 10);
    if (!byDate[d]) byDate[d] = { Low: 0, Medium: 0, High: 0, Critical: 0 };
    byDate[d][log.impact]++;
  });

  const sortedDates = Object.keys(byDate).sort();
  const impacts: ImpactLevel[] = ['Low', 'Medium', 'High', 'Critical'];

  const series = impacts.map((imp) => ({
    name: imp,
    type: 'bar',
    stack: 'total',
    emphasis: { focus: 'series' },
    data: sortedDates.map((d) => byDate[d][imp]),
    itemStyle: { color: impactColor[imp] },
  }));

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#1f1f1f',
      borderColor: '#2a2a2a',
      textStyle: { color: '#e5e7eb' },
    },
    legend: {
      data: impacts,
      textStyle: { color: '#9ca3af', fontSize: 11 },
      top: 0,
    },
    grid: { left: 50, right: 20, top: 32, bottom: 50 },
    xAxis: {
      type: 'category',
      data: sortedDates,
      axisLabel: {
        color: '#9ca3af',
        fontSize: 10,
        rotate: sortedDates.length > 12 ? 45 : 0,
      },
      axisLine: { lineStyle: { color: '#3a3a3a' } },
    },
    yAxis: {
      type: 'value',
      name: '건수',
      nameTextStyle: { color: '#9ca3af', fontSize: 11 },
      axisLabel: { color: '#9ca3af', fontSize: 11 },
      splitLine: { lineStyle: { color: '#2a2a2a' } },
    },
    series,
  };

  return <ReactECharts option={option} style={{ height: 220 }} />;
}

// Encode/decode meeting links: relatedDocLinks may contain mixed entries.
function extractMeetingIds(raw: string): number[] {
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('meeting:'))
    .map((s) => parseInt(s.slice('meeting:'.length)))
    .filter((n) => !isNaN(n));
}

function extractOtherLinks(raw: string): string[] {
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('meeting:'));
}

function ChangeLogForm({ projectId, initial, onSave, onCancel }: {
  projectId: number; initial?: ChangeLog;
  onSave: () => void; onCancel: () => void;
}) {
  const [date, setDate] = useState(initial?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [content, setContent] = useState(initial?.content ?? '');
  const [impact, setImpact] = useState<ImpactLevel>(initial?.impact ?? 'Low');
  const [author, setAuthor] = useState(initial?.author ?? '');
  const [otherLinks, setOtherLinks] = useState<string>(
    initial ? extractOtherLinks(initial.relatedDocLinks).join('\n') : ''
  );
  const [selectedMeetings, setSelectedMeetings] = useState<number[]>(
    initial ? extractMeetingIds(initial.relatedDocLinks) : []
  );
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingKeyword, setMeetingKeyword] = useState('');

  useEffect(() => {
    meetingsApi.getByProject(projectId).then(setMeetings).catch(() => setMeetings([]));
  }, [projectId]);

  const filteredMeetings = useMemo(() => {
    const kw = meetingKeyword.trim().toLowerCase();
    if (!kw) return meetings;
    return meetings.filter((m) =>
      m.topic.toLowerCase().includes(kw) ||
      m.date.slice(0, 10).includes(kw)
    );
  }, [meetings, meetingKeyword]);

  const inputClass =
    'w-full bg-zinc-800/60 border border-zinc-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-zinc-500';

  const toggleMeeting = (id: number) => {
    setSelectedMeetings((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    const linkLines = [
      ...otherLinks.split('\n').map((s) => s.trim()).filter(Boolean),
      ...selectedMeetings.map((id) => `meeting:${id}`),
    ];
    const payload = {
      projectId,
      date,
      content,
      impact,
      relatedDocLinks: linkLines.join('\n'),
      author,
    };
    if (initial) await changeLogsApi.update(projectId, initial.id, payload);
    else await changeLogsApi.create(payload as any);
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#1f1f1f] rounded-lg p-6 w-full max-w-2xl space-y-3 border border-[#2a2a2a] my-4">
        <h2 className="text-base font-medium text-slate-100">{initial ? '변경 이력 수정' : '변경 이력 추가'}</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">날짜</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">영향도</label>
            <select value={impact} onChange={(e) => setImpact(e.target.value as ImpactLevel)} className={inputClass}>
              {(['Low', 'Medium', 'High', 'Critical'] as ImpactLevel[]).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">변경 내용 *</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">작성자</label>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">관련 문서 링크 (한 줄에 하나)</label>
          <textarea
            value={otherLinks}
            onChange={(e) => setOtherLinks(e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs text-slate-400">관련 회의록</label>
            <span className="text-xs text-slate-500">
              {selectedMeetings.length}개 선택 / {meetings.length}개 중
            </span>
          </div>
          <input
            value={meetingKeyword}
            onChange={(e) => setMeetingKeyword(e.target.value)}
            placeholder="회의록 검색 (주제/날짜)"
            className={`${inputClass} mb-2`}
          />
          {meetings.length === 0 ? (
            <p className="text-xs text-slate-500">회의록이 없습니다.</p>
          ) : (
            <div className="h-48 overflow-y-auto border border-zinc-700 rounded-md p-2 space-y-1">
              {filteredMeetings.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-2">검색 결과 없음</p>
              ) : filteredMeetings.map((m) => (
                <label key={m.id} className="flex items-center gap-2 cursor-pointer hover:bg-zinc-800/60 px-2 py-1 rounded">
                  <input
                    type="checkbox"
                    checked={selectedMeetings.includes(m.id)}
                    onChange={() => toggleMeeting(m.id)}
                  />
                  <span className="text-xs text-zinc-400">{m.date.slice(0, 10)}</span>
                  <span className="text-sm text-slate-200 truncate">{m.topic}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-2 border-t border-[#2a2a2a]">
          <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-zinc-800 hover:bg-zinc-700 text-slate-200 transition-colors">
            <X size={14} /> 취소
          </button>
          <button onClick={handleSubmit} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
            <Save size={14} /> 저장
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChangeLogsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = parseInt(projectId!);
  const [logs, setLogs] = useState<ChangeLog[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ChangeLog | null>(null);

  const load = () => changeLogsApi.getByProject(pid).then(setLogs);
  useEffect(() => {
    load();
    meetingsApi.getByProject(pid).then(setMeetings).catch(() => setMeetings([]));
  }, [pid]);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('삭제하시겠습니까?')) return;
    await changeLogsApi.delete(pid, id);
    load();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <GitBranch size={18} className="text-slate-400" />
          변경 이력
        </h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-medium transition-colors"
        >
          <Plus size={14} /> 변경 이력 추가
        </button>
      </div>

      {logs.length > 0 && (
        <div className="bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg p-4">
          <p className="text-xs text-slate-400 mb-2">날짜별 변경 건수 (영향도별)</p>
          <ImpactBarChart logs={logs} />
        </div>
      )}

      <div className="space-y-3">
        {logs.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <GitBranch size={36} className="mx-auto mb-2 text-slate-600" />
            <p className="text-sm">변경 이력이 없습니다.</p>
          </div>
        ) : logs.map((log) => {
          const meetingIds = extractMeetingIds(log.relatedDocLinks);
          const otherLinks = extractOtherLinks(log.relatedDocLinks);
          const linkedMeetings = meetingIds
            .map((id) => meetings.find((m) => m.id === id))
            .filter((m): m is Meeting => !!m);

          return (
            <div
              key={log.id}
              className="bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg p-4 cursor-pointer hover:border-zinc-500 transition-colors"
              onClick={() => setEditing(log)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${impactBg[log.impact]}`}>{log.impact}</span>
                  <span className="text-sm text-slate-400">{log.date.slice(0, 10)}</span>
                  {log.author && <span className="text-xs text-slate-500">by {log.author}</span>}
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setEditing(log)} className="p-1 text-slate-400 hover:text-slate-200" title="수정">
                    <Pencil size={14} />
                  </button>
                  <button onClick={(e) => handleDelete(log.id, e)} className="p-1 text-red-400 hover:text-red-300" title="삭제">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <p className="text-sm text-slate-200 mt-2 line-clamp-2">{log.content}</p>

              {(otherLinks.length > 0 || linkedMeetings.length > 0) && (
                <div className="mt-3 pt-3 border-t border-[#2a2a2a] space-y-1" onClick={(e) => e.stopPropagation()}>
                  {linkedMeetings.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">관련 회의록:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {linkedMeetings.map((m) => (
                          <span key={m.id} className="text-xs bg-zinc-700/40 text-zinc-200 px-2 py-0.5 rounded">
                            {m.date.slice(0, 10)} {m.topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {otherLinks.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">관련 문서:</p>
                      {otherLinks.map((link, i) => (
                        <a
                          key={i}
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-xs text-zinc-300 hover:text-white hover:underline"
                        >
                          {link}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showForm && (
        <ChangeLogForm
          projectId={pid}
          onSave={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {editing && (
        <ChangeLogForm
          projectId={pid}
          initial={editing}
          onSave={() => { setEditing(null); load(); }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
