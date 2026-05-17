import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { Plus, Pencil, X, Save, FileText, Building2, UserPlus, Search, AlertTriangle, ListTree } from 'lucide-react';
import { meetingsApi } from '../api/meetings';
import {
  parseAttendees,
  attendeesToDisplay,
  parseDecisions,
  parseActionItems,
  type AttendeeOrg,
  type ActionItem,
} from '../utils/meetingHelpers';
import { Button, Card, Modal, EmptyState, Skeleton, FormField, inputClass, inputClassNoW } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { applyTextareaTab } from '../utils/textareaTab';
import { useHighlightFromQuery } from '../hooks/useHighlightFromQuery';
import type { Meeting } from '../types';

// 회의록 시간은 30분 단위만 — Chromium native time picker 는 분 spinner 에
// step 옵션을 반영하지 않으므로 <select> 로 대체한다.
const HALF_HOUR_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = (i % 2) * 30;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

function MeetingForm({ projectId, initial, onSave, onCancel }: {
  projectId: number; initial?: Meeting;
  onSave: () => void; onCancel: () => void;
}) {
  const [date, setDate] = useState(initial?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState(initial?.startTime ?? '');
  const [endTime, setEndTime] = useState(initial?.endTime ?? '');
  const [topic, setTopic] = useState(initial?.topic ?? '');
  const [discussion, setDiscussion] = useState(initial?.discussion ?? '');
  const [discussionEditing, setDiscussionEditing] = useState(false);

  const [attendees, setAttendees] = useState<AttendeeOrg[]>(() => {
    const parsed = parseAttendees(initial?.attendees ?? '');
    return parsed.length > 0 ? parsed : [];
  });
  const [legacyAttendees] = useState<string>(() => {
    const parsed = parseAttendees(initial?.attendees ?? '');
    return parsed.length === 0 ? (initial?.attendees ?? '') : '';
  });

  const [decisions, setDecisions] = useState<string[]>(() => parseDecisions(initial?.decisions ?? ''));
  const [decisionInput, setDecisionInput] = useState('');

  const [actionItems, setActionItems] = useState<ActionItem[]>(() => parseActionItems(initial?.actionItems ?? ''));

  const addOrg = () => setAttendees([...attendees, { org: '', members: [''] }]);
  const updateOrg = (i: number, k: 'org', v: string) => {
    const next = [...attendees];
    next[i] = { ...next[i], [k]: v };
    setAttendees(next);
  };
  const removeOrg = (i: number) => setAttendees(attendees.filter((_, idx) => idx !== i));
  const addMember = (i: number) => {
    const next = [...attendees];
    next[i] = { ...next[i], members: [...next[i].members, ''] };
    setAttendees(next);
  };
  const updateMember = (i: number, j: number, v: string) => {
    const next = [...attendees];
    const members = [...next[i].members];
    members[j] = v;
    next[i] = { ...next[i], members };
    setAttendees(next);
  };
  const removeMember = (i: number, j: number) => {
    const next = [...attendees];
    next[i] = { ...next[i], members: next[i].members.filter((_, idx) => idx !== j) };
    setAttendees(next);
  };

  const addDecision = () => {
    if (!decisionInput.trim()) return;
    setDecisions([...decisions, decisionInput.trim()]);
    setDecisionInput('');
  };
  const removeDecision = (i: number) => setDecisions(decisions.filter((_, idx) => idx !== i));

  const addAction = () =>
    setActionItems([...actionItems, { id: crypto.randomUUID(), content: '', assignee: '', deadline: '' }]);
  const updateAction = (i: number, k: keyof ActionItem, v: string) => {
    const next = [...actionItems];
    next[i] = { ...next[i], [k]: v };
    setActionItems(next);
  };
  const removeAction = (i: number) => setActionItems(actionItems.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    const cleanAttendees = attendees
      .filter((a) => a.org.trim() || a.members.some((m) => m.trim()))
      .map((a) => ({ org: a.org.trim(), members: a.members.map((m) => m.trim()).filter(Boolean) }));

    const attendeesPayload =
      cleanAttendees.length > 0 ? JSON.stringify(cleanAttendees) : legacyAttendees;

    const payload = {
      projectId,
      date,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      attendees: attendeesPayload,
      topic,
      decisions: decisions.length > 0 ? JSON.stringify(decisions) : '',
      discussion,
      actionItems:
        actionItems.length > 0 ? JSON.stringify(actionItems.filter((a) => a.content.trim())) : '',
    };
    if (initial) {
      await meetingsApi.update(projectId, initial.id, payload);
    } else {
      await meetingsApi.create(payload as any);
      toast.success(topic.trim() ? `새 회의록 '${topic.trim()}' 이(가) 추가됐어요` : '새 회의록이 추가됐어요');
    }
    onSave();
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title={initial ? '회의록 수정' : '회의록 작성'}
      size="wide"
      fixedHeight
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>취소</Button>
          <Button variant="primary" onClick={handleSubmit} leadingIcon={<Save size={16} />}>저장</Button>
        </>
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 min-h-full">
          {/* 좌측 */}
          <div className="space-y-3">
            <div className="grid grid-cols-12 gap-3">
              <FormField label="날짜" className="col-span-3">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
              </FormField>
              <FormField label="시간 (시작 ~ 종료, 30분 단위)" className="col-span-5">
                <div className="flex items-center gap-2">
                  <select
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className={`${inputClass} flex-1`}
                  >
                    <option value="">--:--</option>
                    {HALF_HOUR_SLOTS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <span className="text-muted text-xs shrink-0">~</span>
                  <select
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className={`${inputClass} flex-1`}
                  >
                    <option value="">--:--</option>
                    {HALF_HOUR_SLOTS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </FormField>
              <FormField label="주제" required className="col-span-4">
                <input value={topic} onChange={(e) => setTopic(e.target.value)} className={inputClass} />
              </FormField>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs text-muted font-medium">참석자 (소속별)</label>
                <Button variant="ghost" size="sm" onClick={addOrg} leadingIcon={<Building2 size={14} />}>
                  소속 추가
                </Button>
              </div>
              {legacyAttendees && (
                <p className="text-xs text-muted mb-2">기존 값: {legacyAttendees}</p>
              )}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {attendees.map((org, i) => (
                  <div key={i} className="border border-default rounded-md p-2 space-y-2">
                    <div className="flex gap-2">
                      <input
                        value={org.org}
                        onChange={(e) => updateOrg(i, 'org', e.target.value)}
                        placeholder="소속명"
                        className={inputClass}
                      />
                      <button onClick={() => removeOrg(i)} className="p-1 text-on-danger hover:opacity-80 transition-opacity" title="소속 삭제" aria-label="소속 삭제">
                        <X size={14} />
                      </button>
                    </div>
                    {org.members.map((m, j) => (
                      <div key={j} className="flex gap-2 pl-3">
                        <input
                          value={m}
                          onChange={(e) => updateMember(i, j, e.target.value)}
                          placeholder="이름"
                          className={inputClass}
                        />
                        <button onClick={() => removeMember(i, j)} className="p-1 text-on-danger hover:opacity-80 transition-opacity" title="인원 삭제" aria-label="인원 삭제">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-3"
                      onClick={() => addMember(i)}
                      leadingIcon={<UserPlus size={14} />}
                    >
                      인원 추가
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-muted font-medium mb-1">주요 결정사항</label>
              <div className="flex gap-2 mb-2">
                <input
                  value={decisionInput}
                  onChange={(e) => setDecisionInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDecision())}
                  placeholder="결정사항 입력 후 추가"
                  className={inputClass}
                />
                <Button variant="secondary" onClick={addDecision} leadingIcon={<Plus size={16} />}>추가</Button>
              </div>
              <ul className="space-y-1">
                {decisions.map((d, i) => (
                  <li key={i} className="flex items-center justify-between bg-surface-2 px-2 py-1 rounded">
                    <span className="text-sm text-secondary">{d}</span>
                    <button onClick={() => removeDecision(i)} className="p-0.5 text-on-danger hover:opacity-80 transition-opacity" title="결정사항 삭제" aria-label="결정사항 삭제">
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs text-muted font-medium">Action Items</label>
                <Button variant="ghost" size="sm" onClick={addAction} leadingIcon={<Plus size={14} />}>추가</Button>
              </div>
              <div className="space-y-2">
                {actionItems.map((a, i) => {
                  const promoted = a.promotedIssueId != null || a.promotedWbsItemId != null;
                  return (
                    <div
                      key={a.id || i}
                      className={`border border-default rounded-md p-2 space-y-2 ${promoted ? 'opacity-70' : ''}`}
                    >
                      <div className="flex gap-2">
                        <input
                          value={a.content}
                          onChange={(e) => updateAction(i, 'content', e.target.value)}
                          placeholder="내용"
                          className={inputClass}
                        />
                        <button onClick={() => removeAction(i)} className="p-1 text-on-danger hover:opacity-80 transition-opacity" title="Action Item 삭제" aria-label="Action Item 삭제">
                          <X size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={a.assignee}
                          onChange={(e) => updateAction(i, 'assignee', e.target.value)}
                          placeholder="담당자"
                          className={inputClass}
                        />
                        <input
                          type="date"
                          value={a.deadline}
                          onChange={(e) => updateAction(i, 'deadline', e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      {promoted && (
                        <div className="flex flex-wrap gap-1 text-xs text-muted">
                          {a.promotedIssueId != null && (
                            <span className="bg-surface-2 border border-default rounded px-1.5 py-0.5">
                              Issue #{a.promotedIssueId} 로 승격됨
                            </span>
                          )}
                          {a.promotedWbsItemId != null && (
                            <span className="bg-surface-2 border border-default rounded px-1.5 py-0.5">
                              WBS #{a.promotedWbsItemId} 로 승격됨
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 우측 - 논의 내용 (마크다운). 모달 우측 공간 끝까지 채움. */}
          <FormField label="논의 내용 (마크다운 지원, 포커스 아웃 시 렌더링)" className="flex-1 flex flex-col min-h-0">
            {discussionEditing || !discussion ? (
              <textarea
                value={discussion}
                onChange={(e) => setDiscussion(e.target.value)}
                onKeyDown={(e) => applyTextareaTab(e, setDiscussion)}
                onFocus={() => setDiscussionEditing(true)}
                onBlur={() => setDiscussionEditing(false)}
                className={`${inputClass} resize-none font-mono flex-1 min-h-0`}
                autoFocus={discussionEditing}
              />
            ) : (
              <div
                onClick={() => setDiscussionEditing(true)}
                className="markdown-body flex-1 min-h-0 overflow-y-auto cursor-text bg-surface-2 border border-default rounded-md px-3 py-2 hover:border-strong transition-colors"
              >
                <ReactMarkdown>{discussion}</ReactMarkdown>
              </div>
            )}
          </FormField>
        </div>
      </div>
    </Modal>
  );
}

function MeetingDetail({ meeting, projectId, onChange }: {
  meeting: Meeting; projectId: number; onChange: () => void;
}) {
  const navigate = useNavigate();
  const decisions = parseDecisions(meeting.decisions);
  const actions = parseActionItems(meeting.actionItems);
  const [busy, setBusy] = useState<string | null>(null);

  const promote = async (a: ActionItem, target: 'issue' | 'wbs') => {
    if (!a.content.trim()) {
      toast.error('내용이 비어 있는 ActionItem 은 승격할 수 없습니다.');
      return;
    }
    setBusy(`${a.id}:${target}`);
    try {
      if (target === 'issue') {
        const issue = await meetingsApi.promoteToIssue(projectId, meeting.id, a.id);
        // Issue 는 Resource FK 라 ActionItem.assignee 문자열이 등록된 리소스와
        // 일치하지 않으면 silent 하게 담당자 미지정(null)이 된다 — 한 줄 안내.
        const unmatched = a.assignee.trim() && issue.assigneeResourceId == null;
        if (unmatched) {
          toast.success(`Issue #${issue.id} 생성됨 — '${a.assignee.trim()}'은 등록된 리소스가 아니라 담당자 미지정`);
        } else {
          toast.success(`Issue #${issue.id} 생성됨`);
        }
      } else {
        const item = await meetingsApi.promoteToWbs(projectId, meeting.id, a.id);
        toast.success(`WBS #${item.id} 생성됨`);
      }
      onChange();
    } catch { /* api/client.ts 가 이미 toast 처리 */ }
    finally { setBusy(null); }
  };

  return (
    <div className="mt-4 pt-4 border-t border-default space-y-4">
      {/* 1. 주요 결정사항 */}
      {decisions.length > 0 && (
        <div>
          <p className="text-xs text-muted font-medium mb-1">주요 결정사항</p>
          <ul className="text-sm text-secondary list-disc pl-5 space-y-0.5">
            {decisions.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>
      )}
      {!decisions.length && meeting.decisions && (
        <div>
          <p className="text-xs text-muted font-medium mb-1">주요 결정사항</p>
          <p className="text-sm text-secondary whitespace-pre-wrap">{meeting.decisions}</p>
        </div>
      )}

      {/* 2. Action Items */}
      {actions.length > 0 && (
        <div>
          <p className="text-xs text-muted font-medium mb-1">Action Items</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="text-left pb-1 pr-2 font-medium">내용</th>
                <th className="text-left pb-1 pr-2 font-medium">담당자</th>
                <th className="text-left pb-1 pr-2 font-medium">기한</th>
                <th className="text-right pb-1 font-medium w-48">승격</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id} className="border-t border-default">
                  <td className="py-1 pr-2 text-secondary">{a.content}</td>
                  <td className="py-1 pr-2 text-secondary">{a.assignee}</td>
                  <td className="py-1 pr-2 text-muted">{a.deadline}</td>
                  <td className="py-1 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {a.promotedIssueId != null ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/projects/${projectId}/issues?highlight=${a.promotedIssueId}`)}
                          className="text-xs bg-surface-2 border border-default rounded px-1.5 py-0.5 hover:border-strong transition-colors"
                          title="Issue 페이지로 이동"
                        >
                          Issue #{a.promotedIssueId}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy === `${a.id}:issue` || !a.content.trim()}
                          onClick={() => promote(a, 'issue')}
                          className="text-xs flex items-center gap-1 px-1.5 py-0.5 rounded border border-default text-muted hover:text-primary hover:border-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <AlertTriangle size={12} /> Issue로
                        </button>
                      )}
                      {a.promotedWbsItemId != null ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/projects/${projectId}/wbs?highlight=${a.promotedWbsItemId}`)}
                          className="text-xs bg-surface-2 border border-default rounded px-1.5 py-0.5 hover:border-strong transition-colors"
                          title="WBS 페이지로 이동"
                        >
                          WBS #{a.promotedWbsItemId}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy === `${a.id}:wbs` || !a.content.trim()}
                          onClick={() => promote(a, 'wbs')}
                          className="text-xs flex items-center gap-1 px-1.5 py-0.5 rounded border border-default text-muted hover:text-primary hover:border-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <ListTree size={12} /> WBS로
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!actions.length && meeting.actionItems && (
        <div>
          <p className="text-xs text-muted font-medium mb-1">Action Items</p>
          <p className="text-sm text-secondary whitespace-pre-wrap">{meeting.actionItems}</p>
        </div>
      )}

      {/* 3. 논의 내용 - 마크다운 렌더링 */}
      {meeting.discussion && (
        <div>
          <p className="text-xs text-muted font-medium mb-1">논의 내용</p>
          <div className="markdown-body">
            <ReactMarkdown>{meeting.discussion}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

export function MeetingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = parseInt(projectId!);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [keyword, setKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // 전체 회의록을 한 번에 가져오고 클라이언트사이드에서 필터링. 본문(Discussion / Decisions / ActionItems)
  // 검색을 위해 백엔드 검색 대신 클라이언트 필터로 통합.
  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setMeetings(await meetingsApi.getByProject(pid));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [pid]);

  // CRUD 후 silent fetch (로딩 깜빡임 없이).
  const refresh = useCallback(() => {
    meetingsApi.getByProject(pid).then(setMeetings).catch(() => {});
  }, [pid]);

  useEffect(() => { load(); }, [load]);

  useHighlightFromQuery([meetings.length]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return meetings.filter((m) => {
      if (kw) {
        const hay = `${m.topic} ${m.discussion ?? ''} ${m.decisions ?? ''} ${m.actionItems ?? ''} ${m.attendees ?? ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      const d = m.date.slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [meetings, keyword, dateFrom, dateTo]);

  const handleDelete = async (id: number) => {
    if (!await confirmDialog({
      title: '회의록 삭제',
      message: '이 회의록을 삭제하시겠습니까? 되돌릴 수 없습니다.',
      confirmLabel: '삭제',
      danger: true,
    })) return;
    await meetingsApi.delete(pid, id);
    refresh();
  };

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        icon={<FileText size={18} />}
        title="회의록"
        actions={
          <Button variant="primary" onClick={() => setShowForm(true)} leadingIcon={<Plus size={16} />}>
            회의록 작성
          </Button>
        }
      />

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative w-72">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="주제·논의·결정사항·참석자 검색…"
            className={`${inputClass} pl-7 py-1.5 text-sm`}
          />
        </div>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-muted text-xs">날짜</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${inputClassNoW} py-1.5 text-sm w-36`} />
          <span className="text-muted">~</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`${inputClassNoW} py-1.5 text-sm w-36`} />
        </div>
        {(keyword || dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setKeyword(''); setDateFrom(''); setDateTo(''); }}>
            초기화
          </Button>
        )}
        <span className="text-xs text-muted ml-auto">{filtered.length} / {meetings.length}</span>
      </div>

      <div className="space-y-3">
        {loading ? (
          <>
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} padding="spacious">
                <Skeleton height={14} width="25%" />
                <Skeleton height={18} width="60%" className="mt-2" />
                <Skeleton height={12} count={2} className="mt-3" />
              </Card>
            ))}
          </>
        ) : error ? (
          <Card padding="spacious">
            <EmptyState error={error} onRetry={load} />
          </Card>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileText size={36} />}
            title={meetings.length === 0 ? '회의록이 없습니다.' : '조건에 맞는 회의록이 없습니다.'}
            description={meetings.length === 0
              ? "우측 상단 '회의록 작성' 버튼으로 새 회의록을 만들어보세요."
              : '검색어나 날짜 범위를 조정해 보세요.'}
          />
        ) : filtered.map((m) => (
          <Card key={m.id} padding="spacious" data-highlight-id={m.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-secondary font-medium">{m.date.slice(0, 10)}</span>
                  {(m.startTime || m.endTime) && (
                    <span className="text-xs text-muted">
                      {m.startTime ?? ''}{m.startTime && m.endTime ? '–' : ''}{m.endTime ?? ''}
                    </span>
                  )}
                  <span className="text-xs text-muted">|</span>
                  <span className="text-xs text-muted truncate">{attendeesToDisplay(m.attendees)}</span>
                </div>
                <h3
                  className="h-section hover:text-accent cursor-pointer transition-colors"
                  onClick={() => setEditing(m)}
                >
                  {m.topic}
                </h3>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setEditing(m)} className="p-1 text-muted hover:text-primary transition-colors" title="수정" aria-label={`회의록 수정 — ${m.topic}`}>
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(m.id)} className="p-1 text-on-danger hover:opacity-80 transition-opacity" title="삭제" aria-label={`회의록 삭제 — ${m.topic}`}>
                  <X size={14} />
                </button>
                <button
                  onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                  className="px-2 text-xs text-muted hover:text-primary transition-colors"
                >
                  {expanded === m.id ? '접기' : '펼치기'}
                </button>
              </div>
            </div>
            {expanded === m.id && <MeetingDetail meeting={m} projectId={pid} onChange={refresh} />}
          </Card>
        ))}
      </div>

      {showForm && (
        <MeetingForm
          projectId={pid}
          onSave={() => { setShowForm(false); refresh(); }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {editing && (
        <MeetingForm
          projectId={pid}
          initial={editing}
          onSave={() => { setEditing(null); refresh(); }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
