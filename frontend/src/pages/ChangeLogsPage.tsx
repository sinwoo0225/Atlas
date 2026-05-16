import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { Plus, Pencil, X, Save, GitBranch, Paperclip, Link as LinkIcon, Search, AlertTriangle, ListTree, ChevronDown, ChevronRight } from 'lucide-react';
import { changeLogsApi } from '../api/changelogs';
import { meetingsApi } from '../api/meetings';
import { issuesApi } from '../api/issues';
import { wbsApi } from '../api/wbs';
import { Button, Card, Modal, Badge, EmptyState, FormField, inputClass, inputClassNoW } from '../components/ui';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { IssuePicker } from '../components/IssuePicker';
import { WbsTreePicker } from '../components/WbsTreePicker';
import { impactBadge } from '../utils/statusMaps';
import { useThemeMode, getChartColors } from '../utils/themeColors';
import { useHighlightFromQuery } from '../hooks/useHighlightFromQuery';
import { findItemName } from '../utils/wbsHelpers';
import type { ChangeLog, ImpactLevel, Meeting, Issue, WbsItem } from '../types';

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

function ChangeLogForm({ projectId, initial, issues, wbsItems, onSave, onCancel }: {
  projectId: number; initial?: ChangeLog;
  issues: Issue[]; wbsItems: WbsItem[];
  onSave: () => void; onCancel: () => void;
}) {
  const [date, setDate] = useState(initial?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [content, setContent] = useState(initial?.content ?? '');
  const [impact, setImpact] = useState<ImpactLevel>(initial?.impact ?? 'Low');
  const [otherLinks, setOtherLinks] = useState<string>(
    initial ? extractOtherLinks(initial.relatedDocLinks).join('\n') : ''
  );
  const [selectedMeetings, setSelectedMeetings] = useState<number[]>(
    initial ? extractMeetingIds(initial.relatedDocLinks) : []
  );
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingKeyword, setMeetingKeyword] = useState('');
  const [sourceIssueId, setSourceIssueId] = useState<number | null>(initial?.sourceIssueId ?? null);
  const [sourceWbsItemId, setSourceWbsItemId] = useState<number | null>(initial?.sourceWbsItemId ?? null);
  const [issuePickerOpen, setIssuePickerOpen] = useState(false);
  const [wbsPickerOpen, setWbsPickerOpen] = useState(false);

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
      sourceIssueId,
      sourceWbsItemId,
    };
    if (initial) await changeLogsApi.update(projectId, initial.id, payload);
    else await changeLogsApi.create(payload);
    onSave();
  };

  const sourceIssueLabel = sourceIssueId != null
    ? (issues.find((i) => i.id === sourceIssueId)?.title ?? `#${sourceIssueId}`)
    : null;
  const sourceWbsLabel = sourceWbsItemId != null ? findItemName(sourceWbsItemId, wbsItems) : null;

  return (
    <Modal
      open
      onClose={onCancel}
      title={initial ? '변경 이력 수정' : '변경 이력 추가'}
      size="lg"
      fixedHeight
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>취소</Button>
          <Button variant="primary" onClick={handleSubmit} leadingIcon={<Save size={16} />}>저장</Button>
        </>
      }
    >
      {/* 콘텐츠 영역 — flex col 로 회의록 영역이 남은 공간 채워 picker 펼침이
          모달 전체에 스크롤 안 만들고 회의록 영역만 압축 */}
      <div className="flex-1 min-h-0 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 shrink-0">
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

        <FormField label="변경 내용" required className="shrink-0">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className={`${inputClass} resize-none`}
          />
        </FormField>

        <FormField label="관련 문서 링크 (한 줄에 하나)" className="shrink-0">
          <textarea
            value={otherLinks}
            onChange={(e) => setOtherLinks(e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </FormField>

        {/* 출처 — 이 변경의 원인이 된 Issue / WBS. 둘 다 nullable 독립. */}
        <div className="grid grid-cols-2 gap-3 shrink-0">
          <FormField label="출처 Issue">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIssuePickerOpen((v) => !v)}
                className={`${inputClass} text-left flex items-center justify-between flex-1`}
              >
                <span className={sourceIssueLabel ? 'text-primary truncate' : 'text-muted'}>
                  {sourceIssueLabel ?? '(없음)'}
                </span>
                {issuePickerOpen ? <ChevronDown size={14} className="text-muted shrink-0" /> : <ChevronRight size={14} className="text-muted shrink-0" />}
              </button>
              {sourceIssueId != null && (
                <button
                  type="button"
                  onClick={() => setSourceIssueId(null)}
                  className="p-1 text-on-danger hover:opacity-80 transition-opacity"
                  title="출처 해제"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {issuePickerOpen && (
              <div className="mt-2 h-56">
                <IssuePicker
                  items={issues}
                  excludeIds={new Set()}
                  onSelect={(id) => { setSourceIssueId(id); setIssuePickerOpen(false); }}
                />
              </div>
            )}
          </FormField>
          <FormField label="출처 WBS 작업">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setWbsPickerOpen((v) => !v)}
                className={`${inputClass} text-left flex items-center justify-between flex-1`}
              >
                <span className={sourceWbsLabel ? 'text-primary truncate' : 'text-muted'}>
                  {sourceWbsLabel ?? '(없음)'}
                </span>
                {wbsPickerOpen ? <ChevronDown size={14} className="text-muted shrink-0" /> : <ChevronRight size={14} className="text-muted shrink-0" />}
              </button>
              {sourceWbsItemId != null && (
                <button
                  type="button"
                  onClick={() => setSourceWbsItemId(null)}
                  className="p-1 text-on-danger hover:opacity-80 transition-opacity"
                  title="출처 해제"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {wbsPickerOpen && (
              <div className="mt-2 h-56">
                <WbsTreePicker
                  items={wbsItems}
                  selectedId={sourceWbsItemId}
                  excludeIds={new Set()}
                  showRoot={false}
                  onSelect={(id) => { if (id != null) { setSourceWbsItemId(id); setWbsPickerOpen(false); } }}
                />
              </div>
            )}
          </FormField>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between mb-1 shrink-0">
            <label className="block text-xs text-muted font-medium">관련 회의록</label>
            <span className="text-xs text-muted">
              {selectedMeetings.length}개 선택 / {meetings.length}개 중
            </span>
          </div>
          <input
            value={meetingKeyword}
            onChange={(e) => setMeetingKeyword(e.target.value)}
            placeholder="회의록 검색 (주제/날짜)"
            className={`${inputClass} mb-2 shrink-0`}
          />
          {meetings.length === 0 ? (
            <p className="text-xs text-muted">회의록이 없습니다.</p>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto border border-default rounded-md p-2 space-y-1">
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

      </div>{/* 콘텐츠 영역 끝 */}
    </Modal>
  );
}

export function ChangeLogsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = parseInt(projectId!);
  const navigate = useNavigate();
  const [logs, setLogs] = useState<ChangeLog[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [wbsItems, setWbsItems] = useState<WbsItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ChangeLog | null>(null);
  const [keyword, setKeyword] = useState('');
  const [impactFilter, setImpactFilter] = useState<ImpactLevel | 'All'>('All');

  const load = () => changeLogsApi.getByProject(pid).then(setLogs);
  useEffect(() => {
    load();
    meetingsApi.getByProject(pid).then(setMeetings).catch(() => setMeetings([]));
    // 출처 picker 용 — 모달 열림과 무관하게 한 번 로드.
    issuesApi.getByProject(pid).then(setIssues).catch(() => setIssues([]));
    wbsApi.getByProject(pid).then(setWbsItems).catch(() => setWbsItems([]));
  }, [pid]);

  useHighlightFromQuery([logs.length]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return logs.filter((l) => {
      if (impactFilter !== 'All' && l.impact !== impactFilter) return false;
      if (kw) {
        const hay = `${l.content} ${l.createdBy ?? ''} ${l.updatedBy ?? ''} ${l.relatedDocLinks ?? ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [logs, keyword, impactFilter]);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!await confirmDialog({
      title: '변경 이력 삭제',
      message: '이 변경 이력을 삭제하시겠습니까? 되돌릴 수 없습니다.',
      confirmLabel: '삭제',
      danger: true,
    })) return;
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

      {logs.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative w-64">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="내용·작성자·문서 링크 검색…"
              className={`${inputClass} pl-7 py-1.5 text-sm`}
            />
          </div>
          <select
            value={impactFilter}
            onChange={(e) => setImpactFilter(e.target.value as ImpactLevel | 'All')}
            className={`${inputClassNoW} py-1.5 text-sm w-36`}
          >
            <option value="All">영향도 전체</option>
            {(['Low', 'Medium', 'High', 'Critical'] as ImpactLevel[]).map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          {(keyword || impactFilter !== 'All') && (
            <Button variant="ghost" size="sm" onClick={() => { setKeyword(''); setImpactFilter('All'); }}>
              초기화
            </Button>
          )}
          <span className="text-xs text-muted ml-auto">{filtered.length} / {logs.length}</span>
        </div>
      )}

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<GitBranch size={36} />}
            title={logs.length === 0 ? '변경 이력이 없습니다.' : '조건에 맞는 변경 이력이 없습니다.'}
            description={logs.length === 0
              ? "우측 상단 '변경 이력 추가' 버튼으로 시작해보세요."
              : '검색어나 영향도 필터를 조정해 보세요.'}
          />
        ) : filtered.map((log) => {
          const meetingIds = extractMeetingIds(log.relatedDocLinks);
          const otherLinks = extractOtherLinks(log.relatedDocLinks);
          const linkedMeetings = meetingIds
            .map((id) => meetings.find((m) => m.id === id))
            .filter((m): m is Meeting => !!m);

          return (
            <Card
              key={log.id}
              data-highlight-id={log.id}
              padding="normal"
              className="cursor-pointer hover:border-strong transition-colors"
              onClick={() => setEditing(log)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <Badge variant={impactBadge[log.impact].variant} size="sm">{log.impact}</Badge>
                  {log.sourceIssueId != null && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); navigate(`/projects/${pid}/issues?highlight=${log.sourceIssueId}`); }}
                      className="text-xs flex items-center gap-1 px-1.5 py-0.5 rounded border border-default bg-surface-2 text-muted hover:text-primary hover:border-strong transition-colors max-w-[16rem] truncate"
                      title={log.sourceIssueTitle ?? `Issue #${log.sourceIssueId}`}
                    >
                      <AlertTriangle size={11} className="shrink-0" />
                      <span className="truncate">{log.sourceIssueTitle ?? `Issue #${log.sourceIssueId}`}</span>
                    </button>
                  )}
                  {log.sourceWbsItemId != null && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); navigate(`/projects/${pid}/wbs?highlight=${log.sourceWbsItemId}`); }}
                      className="text-xs flex items-center gap-1 px-1.5 py-0.5 rounded border border-default bg-surface-2 text-muted hover:text-primary hover:border-strong transition-colors max-w-[16rem] truncate"
                      title={log.sourceWbsItemName ?? `WBS #${log.sourceWbsItemId}`}
                    >
                      <ListTree size={11} className="shrink-0" />
                      <span className="truncate">{log.sourceWbsItemName ?? `WBS #${log.sourceWbsItemId}`}</span>
                    </button>
                  )}
                  <span className="text-sm text-muted">{log.date.slice(0, 10)}</span>
                  {log.createdBy && <span className="text-xs text-muted">by {log.createdBy}</span>}
                  {log.updatedBy && log.updatedBy !== log.createdBy && (
                    <span className="text-xs text-muted">· 수정 {log.updatedBy}</span>
                  )}
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
          issues={issues}
          wbsItems={wbsItems}
          onSave={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {editing && (
        <ChangeLogForm
          projectId={pid}
          initial={editing}
          issues={issues}
          wbsItems={wbsItems}
          onSave={() => { setEditing(null); load(); }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
