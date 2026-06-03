import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import ReactECharts from 'echarts-for-react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, X, Save, GitBranch, Paperclip, Link as LinkIcon, Search, AlertTriangle, ListTree, ChevronDown, ChevronRight } from 'lucide-react';
import { changeLogsApi } from '../api/changelogs';
import { meetingsApi } from '../api/meetings';
import { issuesApi } from '../api/issues';
import { wbsApi } from '../api/wbs';
import { Button, Card, Modal, Input, Badge, EmptyState, Skeleton, FormField, inputClass, inputClassNoW } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { IssuePicker } from '../components/IssuePicker';
import { WbsTreePicker } from '../components/WbsTreePicker';
import { impactBadge } from '../utils/statusMaps';
import { useThemeMode, getChartColors } from '../utils/themeColors';
import { useHighlightFromQuery } from '../hooks/useHighlightFromQuery';
import { useCreateForm } from '../hooks/useCreateForm';
import { useCurrentProject } from '../hooks/useCurrentProject';
import { findItemName } from '../utils/wbsHelpers';
import { applyTextareaTab } from '../utils/textareaTab';
import { GitHistoryView } from '../components/GitHistoryView';
import type { ChangeLog, ImpactLevel, Meeting, Issue, WbsItem } from '../types';

const impactColor: Record<ImpactLevel, string> = {
  Low: '#34d399',
  Medium: '#fbbf24',
  High: '#fb923c',
  Critical: '#f87171',
};

// 영향도 분포 + 일자별 차트 (히트맵 대신 stacked bar chart 사용)
function ImpactBarChart({ logs }: { logs: ChangeLog[] }) {
  const { t } = useTranslation();
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
      name: t('changelog:chart.countAxis'),
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

function ChangeLogForm({ projectId, initial, issues, wbsItems, onRefreshIssues, defaultSourceIssueId, onSave, onCancel }: {
  projectId: number; initial?: ChangeLog;
  issues: Issue[]; wbsItems: WbsItem[];
  onRefreshIssues: () => void;
  defaultSourceIssueId?: number | null;
  onSave: () => void; onCancel: () => void;
}) {
  const { t } = useTranslation();
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
  // initial 우선, 없으면 defaultSourceIssueId (Issue 닫힘 토스트 → 자동 새 폼 경로).
  const [sourceIssueId, setSourceIssueId] = useState<number | null>(initial?.sourceIssueId ?? defaultSourceIssueId ?? null);
  const [sourceWbsItemId, setSourceWbsItemId] = useState<number | null>(initial?.sourceWbsItemId ?? null);
  const [issuePickerOpen, setIssuePickerOpen] = useState(false);
  const [wbsPickerOpen, setWbsPickerOpen] = useState(false);
  // 변경 내용 마크다운 미리보기 토글 (회의록 논의내용 패턴). 표시 토글일 뿐 dirty 와 무관.
  const [contentEditing, setContentEditing] = useState(false);
  // 동시성 토큰 (사이클 12) — 충돌 시 [서버 값 보기] 액션으로 갱신.
  const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState<string | undefined>(initial?.updatedAt);
  // dirty 가드 — 모달 닫기 시 변경 손실 확인. [서버 값 보기] 시 setInitialSnapshot 으로 새 기준 적용.
  const [initialSnapshot, setInitialSnapshot] = useState(() => JSON.stringify({
    date: initial?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    content: initial?.content ?? '',
    impact: initial?.impact ?? 'Low',
    otherLinks: initial ? extractOtherLinks(initial.relatedDocLinks).join('\n') : '',
    selectedMeetings: initial ? extractMeetingIds(initial.relatedDocLinks) : [],
    sourceIssueId: initial?.sourceIssueId ?? defaultSourceIssueId ?? null,
    sourceWbsItemId: initial?.sourceWbsItemId ?? null,
  }));
  const dirty = JSON.stringify({
    date, content, impact, otherLinks, selectedMeetings, sourceIssueId, sourceWbsItemId,
  }) !== initialSnapshot;

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
      ...(initial ? { updatedAt: snapshotUpdatedAt } : {}),
    };
    if (initial) {
      try {
        await changeLogsApi.update(projectId, initial.id, payload, { silent: true });
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('API error 409')) {
          toast.warning(
            t('changelog:form.conflictToast'),
            {
              duration: 8000,
              action: {
                label: t('changelog:form.viewServer'),
                onClick: async () => {
                  const fresh = await changeLogsApi.get(projectId, initial.id);
                  setSnapshotUpdatedAt(fresh.updatedAt);
                  const freshDate = fresh.date?.slice(0, 10) ?? '';
                  const freshContent = fresh.content ?? '';
                  const freshImpact = fresh.impact;
                  const freshOtherLinks = extractOtherLinks(fresh.relatedDocLinks).join('\n');
                  const freshSelectedMeetings = extractMeetingIds(fresh.relatedDocLinks);
                  const freshSourceIssueId = fresh.sourceIssueId ?? null;
                  const freshSourceWbsItemId = fresh.sourceWbsItemId ?? null;
                  setDate(freshDate);
                  setContent(freshContent);
                  setImpact(freshImpact);
                  setOtherLinks(freshOtherLinks);
                  setSelectedMeetings(freshSelectedMeetings);
                  setSourceIssueId(freshSourceIssueId);
                  setSourceWbsItemId(freshSourceWbsItemId);
                  setInitialSnapshot(JSON.stringify({
                    date: freshDate, content: freshContent, impact: freshImpact,
                    otherLinks: freshOtherLinks, selectedMeetings: freshSelectedMeetings,
                    sourceIssueId: freshSourceIssueId, sourceWbsItemId: freshSourceWbsItemId,
                  }));
                  toast.info(t('changelog:form.serverFetched'));
                },
              },
            },
          );
          return;
        }
        toast.error(t('common:saveFailed'));
        return;
      }
    } else {
      await changeLogsApi.create(payload);
      toast.success(t('changelog:toast.created'));
    }
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
      title={initial ? t('changelog:form.editTitle') : t('changelog:form.newTitle')}
      size="wide"
      fixedHeight
      dirty={dirty}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>{t('common:cancel')}</Button>
          <Button variant="primary" onClick={handleSubmit} leadingIcon={<Save size={16} />}>{t('common:save')}</Button>
        </>
      }
    >
      {/* 회의록 폼 패턴 — 2단: 좌측 메타/연관, 우측 변경 내용(세로 가득 + 마크다운 미리보기) */}
      <div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 min-h-full">
          {/* 좌측 — 날짜·영향도·링크·출처·관련 회의록 */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t('changelog:form.date')}>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
              </FormField>
              <FormField label={t('changelog:form.impact')}>
                <select value={impact} onChange={(e) => setImpact(e.target.value as ImpactLevel)} className={inputClass}>
                  {(['Low', 'Medium', 'High', 'Critical'] as ImpactLevel[]).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </FormField>
            </div>

            <FormField label={t('changelog:form.relatedDocs')}>
              <textarea
                value={otherLinks}
                onChange={(e) => setOtherLinks(e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </FormField>

            {/* 출처 — 이 변경의 원인이 된 Issue / WBS. 둘 다 nullable 독립. */}
            <FormField label={t('changelog:form.sourceIssue')}>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setIssuePickerOpen((v) => {
                      const next = !v;
                      if (next) onRefreshIssues();
                      return next;
                    });
                  }}
                  className={`${inputClass} text-left flex items-center justify-between flex-1`}
                >
                  <span className={sourceIssueLabel ? 'text-primary truncate' : 'text-muted'}>
                    {sourceIssueLabel ?? t('changelog:form.none')}
                  </span>
                  {issuePickerOpen ? <ChevronDown size={14} className="text-muted shrink-0" /> : <ChevronRight size={14} className="text-muted shrink-0" />}
                </button>
                {sourceIssueId != null && (
                  <button
                    type="button"
                    onClick={() => setSourceIssueId(null)}
                    className="p-1 text-on-danger hover:opacity-80 transition-opacity"
                    title={t('changelog:form.clearSource')}
                    aria-label={t('changelog:form.clearSourceIssueAria')}
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
            <FormField label={t('changelog:form.sourceWbs')}>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setWbsPickerOpen((v) => !v)}
                  className={`${inputClass} text-left flex items-center justify-between flex-1`}
                >
                  <span className={sourceWbsLabel ? 'text-primary truncate' : 'text-muted'}>
                    {sourceWbsLabel ?? t('changelog:form.none')}
                  </span>
                  {wbsPickerOpen ? <ChevronDown size={14} className="text-muted shrink-0" /> : <ChevronRight size={14} className="text-muted shrink-0" />}
                </button>
                {sourceWbsItemId != null && (
                  <button
                    type="button"
                    onClick={() => setSourceWbsItemId(null)}
                    className="p-1 text-on-danger hover:opacity-80 transition-opacity"
                    title={t('changelog:form.clearSource')}
                    aria-label={t('changelog:form.clearSourceWbsAria')}
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

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-muted font-medium">{t('changelog:form.relatedMeetings')}</label>
                <span className="text-xs text-muted">
                  {t('changelog:form.meetingsSelected', { selected: selectedMeetings.length, total: meetings.length })}
                </span>
              </div>
              <input
                value={meetingKeyword}
                onChange={(e) => setMeetingKeyword(e.target.value)}
                placeholder={t('changelog:form.meetingSearch')}
                className={`${inputClass} mb-2`}
              />
              {meetings.length === 0 ? (
                <p className="text-xs text-muted">{t('changelog:form.noMeetings')}</p>
              ) : (
                <div className="max-h-48 overflow-y-auto border border-default rounded-md p-2 space-y-1">
                  {filteredMeetings.length === 0 ? (
                    <p className="text-xs text-muted text-center py-2">{t('changelog:form.noSearchResult')}</p>
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
          </div>

          {/* 우측 — 변경 내용 (마크다운). 모달 우측 공간 끝까지 채움. */}
          <FormField label={t('changelog:form.content')} required className="flex-1 flex flex-col min-h-0">
            {contentEditing || !content ? (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => applyTextareaTab(e, setContent)}
                onFocus={() => setContentEditing(true)}
                onBlur={() => setContentEditing(false)}
                className={`${inputClass} resize-none font-mono flex-1 min-h-0`}
                autoFocus={contentEditing}
              />
            ) : (
              <div
                onClick={() => setContentEditing(true)}
                className="markdown-body flex-1 min-h-0 overflow-y-auto cursor-text bg-surface-2 border border-default rounded-md px-3 py-2 hover:border-strong transition-colors"
              >
                <ReactMarkdown>{content}</ReactMarkdown>
              </div>
            )}
          </FormField>
        </div>
      </div>{/* 콘텐츠 영역 끝 */}
    </Modal>
  );
}

export function ChangeLogsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = parseInt(projectId!);
  const project = useCurrentProject();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [logs, setLogs] = useState<ChangeLog[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [wbsItems, setWbsItems] = useState<WbsItem[]>([]);
  // URL ?newWithSourceIssue=N — Issue 닫힘 토스트의 "변경이력 추가" 클릭으로 도달.
  // mount 시 1회 동기 읽어 초기값 결정 (useState lazy init — set-state-in-effect 회피).
  const initialNewWithSourceIssue = (() => {
    const p = new URLSearchParams(window.location.search).get('newWithSourceIssue');
    return p ? Number(p) : null;
  })();
  const [showForm, setShowForm] = useState(initialNewWithSourceIssue != null);
  const [defaultSourceIssueId, setDefaultSourceIssueId] = useState<number | null>(initialNewWithSourceIssue);
  const [editing, setEditing] = useState<ChangeLog | null>(null);
  // '변경 이력'(수기 기록) ↔ 'Git 이력'(연결된 .git 커밋 그래프) 탭 전환.
  const [tab, setTab] = useState<'changelog' | 'git'>('changelog');

  useCreateForm(() => { setEditing(null); setShowForm(true); });
  const [keyword, setKeyword] = useState('');
  const [impactFilter, setImpactFilter] = useState<ImpactLevel | 'All'>('All');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'withSource' | 'noSource'>('all');
  // URL ?sourceIssue=N / ?sourceWbs=N — Issue/WBS 행 배지 클릭으로 도달했을 때 자동 필터.
  const filterSourceIssue = searchParams.get('sourceIssue');
  const filterSourceWbs = searchParams.get('sourceWbs');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // 목록 인라인 펼치기 — 단일 확장 id (회의록 패턴).
  const [expanded, setExpanded] = useState<number | null>(null);

  // 위 lazy init 으로 소비한 쿼리는 URL 에서 제거 (시각적 위생). 외부 시스템(URL) 동기화이므로 effect OK.
  useEffect(() => {
    if (searchParams.has('newWithSourceIssue')) {
      searchParams.delete('newWithSourceIssue');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [ls, ms, is, ws] = await Promise.all([
        changeLogsApi.getByProject(pid),
        meetingsApi.getByProject(pid),
        issuesApi.getByProject(pid),
        wbsApi.getByProject(pid),
      ]);
      setLogs(ls);
      setMeetings(ms);
      setIssues(is);
      setWbsItems(ws);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [pid]);

  const refreshLogs = useCallback(() => {
    changeLogsApi.getByProject(pid).then(setLogs).catch(() => {});
  }, [pid]);

  // 출처 Issue picker 열 때마다 issues silent refetch — 다른 탭에서 만든 새 Issue 즉시 반영.
  const refreshIssues = useCallback(() => {
    issuesApi.getByProject(pid).then(setIssues).catch(() => {});
  }, [pid]);

  useEffect(() => { load(); }, [load]);

  useHighlightFromQuery([logs.length]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const filterIssueIdNum = filterSourceIssue != null ? Number(filterSourceIssue) : null;
    const filterWbsIdNum = filterSourceWbs != null ? Number(filterSourceWbs) : null;
    return logs.filter((l) => {
      if (impactFilter !== 'All' && l.impact !== impactFilter) return false;
      const hasSource = l.sourceIssueId != null || l.sourceWbsItemId != null;
      if (sourceFilter === 'withSource' && !hasSource) return false;
      if (sourceFilter === 'noSource' && hasSource) return false;
      // URL 쿼리 — 특정 source 만
      if (filterIssueIdNum != null && l.sourceIssueId !== filterIssueIdNum) return false;
      if (filterWbsIdNum != null && l.sourceWbsItemId !== filterWbsIdNum) return false;
      if (kw) {
        const hay = `${l.content} ${l.createdBy ?? ''} ${l.updatedBy ?? ''} ${l.relatedDocLinks ?? ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [logs, keyword, impactFilter, sourceFilter, filterSourceIssue, filterSourceWbs]);

  const clearSourceQuery = () => {
    if (searchParams.has('sourceIssue') || searchParams.has('sourceWbs')) {
      searchParams.delete('sourceIssue');
      searchParams.delete('sourceWbs');
      setSearchParams(searchParams, { replace: true });
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!await confirmDialog({
      title: t('changelog:delete.title'),
      message: t('changelog:delete.message'),
      confirmLabel: t('common:delete'),
      danger: true,
    })) return;
    await changeLogsApi.delete(pid, id);
    refreshLogs();
  };

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        icon={<GitBranch size={18} />}
        breadcrumb={project?.name}
        title={t('changelog:title')}
        actions={
          tab === 'changelog' ? (
            <Button variant="primary" onClick={() => setShowForm(true)} leadingIcon={<Plus size={16} />}>
              {t('changelog:newBtn')}
            </Button>
          ) : undefined
        }
      />

      <div className="flex gap-1 border-b border-default">
        {(['changelog', 'git'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? 'text-primary' : 'border-transparent text-muted hover:text-primary'
            }`}
            style={tab === key ? { borderColor: 'var(--accent)' } : undefined}
          >
            {t('changelog:tab.' + key)}
          </button>
        ))}
      </div>

      {tab === 'git' ? (
        <GitHistoryView projectId={pid} />
      ) : (
      <>
      {loading && (
        <Card padding="spacious">
          <Skeleton height={18} width="30%" />
          <div className="mt-4 space-y-2">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={36} />)}
          </div>
        </Card>
      )}

      {!loading && error != null && (
        <Card padding="spacious">
          <EmptyState error={error} onRetry={load} />
        </Card>
      )}

      {!loading && !error && logs.length > 0 && (
        <Card padding="normal">
          <p className="text-xs text-muted mb-2">{t('changelog:chart.caption')}</p>
          <ImpactBarChart logs={logs} />
        </Card>
      )}

      {!loading && !error && logs.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <Input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('changelog:searchPlaceholder')}
            leadingIcon={<Search size={14} />}
            fullWidth={false}
            wrapperClassName="w-64"
            className="py-1.5 text-sm"
          />
          <select
            value={impactFilter}
            onChange={(e) => setImpactFilter(e.target.value as ImpactLevel | 'All')}
            className={`${inputClassNoW} py-1.5 text-sm w-36`}
          >
            <option value="All">{t('changelog:filter.allImpact')}</option>
            {(['Low', 'Medium', 'High', 'Critical'] as ImpactLevel[]).map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as 'all' | 'withSource' | 'noSource')}
            className={`${inputClassNoW} py-1.5 text-sm w-32`}
          >
            <option value="all">{t('changelog:filter.allSource')}</option>
            <option value="withSource">{t('changelog:filter.withSource')}</option>
            <option value="noSource">{t('changelog:filter.noSource')}</option>
          </select>
          {/* URL 쿼리 (?sourceIssue=N / ?sourceWbs=N) 활성 — 자동 필터 안내 + 해제 */}
          {(filterSourceIssue || filterSourceWbs) && (
            <Badge variant="accent" size="sm" className="flex items-center gap-1">
              {filterSourceIssue ? t('changelog:filter.sourceIssueBadge', { id: filterSourceIssue }) : t('changelog:filter.sourceWbsBadge', { id: filterSourceWbs })}
              <button
                type="button"
                onClick={clearSourceQuery}
                className="hover:opacity-70"
                aria-label={t('changelog:filter.clearSourceAria')}
              >
                <X size={11} />
              </button>
            </Badge>
          )}
          {(keyword || impactFilter !== 'All' || sourceFilter !== 'all' || filterSourceIssue || filterSourceWbs) && (
            <Button variant="ghost" size="sm" onClick={() => { setKeyword(''); setImpactFilter('All'); setSourceFilter('all'); clearSourceQuery(); }}>
              {t('common:reset')}
            </Button>
          )}
          <span className="text-xs text-muted ml-auto">{filtered.length} / {logs.length}</span>
        </div>
      )}

      {!loading && !error && (
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<GitBranch size={36} />}
            title={logs.length === 0 ? t('changelog:empty.titleNone') : t('changelog:empty.titleFiltered')}
            description={logs.length === 0
              ? t('changelog:empty.descNone')
              : t('changelog:empty.descAdjust')}
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
                    <span className="text-xs text-muted">· {t('changelog:card.editedBy', { name: log.updatedBy })}</span>
                  )}
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    className="px-2 text-xs text-muted hover:text-primary transition-colors"
                    aria-expanded={expanded === log.id}
                    aria-label={t('changelog:card.toggleAria', { state: expanded === log.id ? t('changelog:card.collapse') : t('changelog:card.expand'), date: log.date.slice(0, 10) })}
                  >
                    {expanded === log.id ? t('changelog:card.collapse') : t('changelog:card.expand')}
                  </button>
                  <button onClick={() => setEditing(log)} className="p-1 text-muted hover:text-primary transition-colors" title={t('common:edit')} aria-label={t('changelog:card.editAria', { date: log.date.slice(0, 10) })}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={(e) => handleDelete(log.id, e)} className="p-1 text-on-danger hover:opacity-80 transition-opacity" title={t('common:delete')} aria-label={t('changelog:card.deleteAria', { date: log.date.slice(0, 10) })}>
                    <X size={14} />
                  </button>
                </div>
              </div>
              {expanded === log.id ? (
                <div className="markdown-body mt-2" onClick={(e) => e.stopPropagation()}>
                  <ReactMarkdown>{log.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-secondary mt-2 line-clamp-2">{log.content}</p>
              )}

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
      )}
      </>
      )}

      {showForm && (
        <ChangeLogForm
          projectId={pid}
          issues={issues}
          wbsItems={wbsItems}
          onRefreshIssues={refreshIssues}
          defaultSourceIssueId={defaultSourceIssueId}
          onSave={() => { setShowForm(false); setDefaultSourceIssueId(null); refreshLogs(); }}
          onCancel={() => { setShowForm(false); setDefaultSourceIssueId(null); }}
        />
      )}
      {editing && (
        <ChangeLogForm
          projectId={pid}
          initial={editing}
          issues={issues}
          wbsItems={wbsItems}
          onRefreshIssues={refreshIssues}
          onSave={() => { setEditing(null); refreshLogs(); }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
