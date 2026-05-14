import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { Plus, Pencil, X, Save, GitBranch, Paperclip, Link as LinkIcon } from 'lucide-react';
import { changeLogsApi } from '../api/changelogs';
import { meetingsApi } from '../api/meetings';
import { Button, Card, Badge, EmptyState, FormField, inputClass } from '../components/ui';
import { impactBadge } from '../utils/statusMaps';
import { useThemeMode, getChartColors } from '../utils/themeColors';
import type { ChangeLog, ImpactLevel, Meeting } from '../types';

const impactColor: Record<ImpactLevel, string> = {
  Low: '#34d399',
  Medium: '#fbbf24',
  High: '#fb923c',
  Critical: '#f87171',
};

// 영향도 분포 + 일자별 차트 (히트맵 대신 stacked bar chart 사용)
function ImpactBarChart({ logs }: { logs: ChangeLog[] }) {
  const theme = useThemeMode();
  const colors = getChartColors(theme);

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
      backgroundColor: colors.tooltipBg,
      borderColor: colors.tooltipBorder,
      textStyle: { color: colors.tooltipText },
    },
    legend: {
      data: impacts,
      textStyle: { color: colors.axisText, fontSize: 11 },
      top: 0,
    },
    grid: { left: 50, right: 20, top: 32, bottom: 50 },
    xAxis: {
      type: 'category',
      data: sortedDates,
      axisLabel: {
        color: colors.axisText,
        fontSize: 10,
        rotate: sortedDates.length > 12 ? 45 : 0,
      },
      axisLine: { lineStyle: { color: colors.axisLine } },
    },
    yAxis: {
      type: 'value',
      name: '건수',
      nameTextStyle: { color: colors.axisText, fontSize: 11 },
      axisLabel: { color: colors.axisText, fontSize: 11 },
      splitLine: { lineStyle: { color: colors.splitLine } },
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

// 카드 메타 영역에서 링크를 한 줄에 더 많이 보여주기 위해 짧은 라벨로 축약.
// URL 이면 호스트 + 마지막 세그먼트, 평문 파일경로면 마지막 세그먼트만.
function formatLinkLabel(raw: string): string {
  const s = raw.trim();
  try {
    const u = new URL(s);
    const lastSeg = u.pathname.split('/').filter(Boolean).pop();
    return lastSeg ? `${u.hostname}/${lastSeg}` : u.hostname;
  } catch {
    const seg = s.split(/[\\/]/).filter(Boolean).pop();
    return seg ?? s;
  }
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
    <div className="modal-overlay fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card padding="spacious" className="w-full max-w-2xl my-4 space-y-3">
        <h2 className="h-section">{initial ? '변경 이력 수정' : '변경 이력 추가'}</h2>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="날짜">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="영향도">
            <select value={impact} onChange={(e) => setImpact(e.target.value as ImpactLevel)} className={inputClass}>
              {(['Low', 'Medium', 'High', 'Critical'] as ImpactLevel[]).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField label="변경 내용" required>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className={`${inputClass} resize-none`}
          />
        </FormField>

        <FormField label="작성자">
          <input value={author} onChange={(e) => setAuthor(e.target.value)} className={inputClass} />
        </FormField>

        <FormField label="관련 문서 링크 (한 줄에 하나)">
          <textarea
            value={otherLinks}
            onChange={(e) => setOtherLinks(e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </FormField>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs text-muted font-medium">관련 회의록</label>
            <span className="text-xs text-muted">
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
            <p className="text-xs text-muted">회의록이 없습니다.</p>
          ) : (
            <div className="h-48 overflow-y-auto border border-default rounded-md p-2 space-y-1">
              {filteredMeetings.length === 0 ? (
                <p className="text-xs text-muted text-center py-2">검색 결과 없음</p>
              ) : filteredMeetings.map((m) => (
                <label key={m.id} className="flex items-center gap-2 cursor-pointer hover:bg-surface-2 px-2 py-1 rounded transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedMeetings.includes(m.id)}
                    onChange={() => toggleMeeting(m.id)}
                  />
                  <span className="text-xs text-muted">{m.date.slice(0, 10)}</span>
                  <span className="text-sm text-secondary truncate">{m.topic}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-2 border-t border-default">
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>취소</Button>
          <Button variant="primary" onClick={handleSubmit} leadingIcon={<Save size={16} />}>저장</Button>
        </div>
      </Card>
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
        <h1 className="h-page flex items-center gap-2">
          <GitBranch size={18} className="text-muted" />
          변경 이력
        </h1>
        <Button variant="primary" onClick={() => setShowForm(true)} leadingIcon={<Plus size={16} />}>
          변경 이력 추가
        </Button>
      </div>

      {logs.length > 0 && (
        <Card padding="normal">
          <p className="text-xs text-muted mb-2">날짜별 변경 건수 (영향도별)</p>
          <ImpactBarChart logs={logs} />
        </Card>
      )}

      <div className="space-y-3">
        {logs.length === 0 ? (
          <EmptyState
            icon={<GitBranch size={36} />}
            title="변경 이력이 없습니다."
            description="우측 상단 '변경 이력 추가' 버튼으로 시작해보세요."
          />
        ) : logs.map((log) => {
          const meetingIds = extractMeetingIds(log.relatedDocLinks);
          const otherLinks = extractOtherLinks(log.relatedDocLinks);
          const linkedMeetings = meetingIds
            .map((id) => meetings.find((m) => m.id === id))
            .filter((m): m is Meeting => !!m);

          return (
            <Card
              key={log.id}
              padding="normal"
              className="cursor-pointer hover:border-strong transition-colors"
              onClick={() => setEditing(log)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={impactBadge[log.impact].variant} size="sm">{log.impact}</Badge>
                  <span className="text-sm text-muted">{log.date.slice(0, 10)}</span>
                  {log.author && <span className="text-xs text-muted">by {log.author}</span>}
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setEditing(log)} className="p-1 text-muted hover:text-primary transition-colors" title="수정">
                    <Pencil size={14} />
                  </button>
                  <button onClick={(e) => handleDelete(log.id, e)} className="p-1 text-on-danger hover:opacity-80 transition-opacity" title="삭제">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <p className="text-sm text-secondary mt-2 line-clamp-2">{log.content}</p>

              {(otherLinks.length > 0 || linkedMeetings.length > 0) && (
                <div
                  className="mt-2 pt-2 border-t border-default flex flex-wrap items-center gap-x-3 gap-y-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {linkedMeetings.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Paperclip size={12} className="text-muted shrink-0" />
                      {linkedMeetings.map((m) => (
                        <Badge key={m.id} variant="neutral" size="sm">
                          {m.date.slice(0, 10)} {m.topic}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {otherLinks.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <LinkIcon size={12} className="text-muted shrink-0" />
                      {otherLinks.map((link, i) => (
                        <a
                          key={i}
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          title={link}
                          className="text-xs text-secondary hover:text-primary hover:underline transition-colors max-w-[16rem] truncate"
                        >
                          {formatLinkLabel(link)}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
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
