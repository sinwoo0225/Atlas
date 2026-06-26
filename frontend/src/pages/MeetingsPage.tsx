import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, X, Save, FileText, Building2, Search, AlertTriangle, ListTree, Sparkles, Mic, Star } from 'lucide-react';
import { meetingsApi } from '../api/meetings';
import { FavoriteStar } from '../components/FavoriteStar';
import { favoritesFirst } from '../utils/favorites';
import { resourcesApi } from '../api/resources';
import { aiApi } from '../api/ai';
import { loadSettings } from '../store/settings';
import { isHostBridgeAvailable, launchDictation } from '../utils/hostBridge';
import {
  parseAttendees,
  attendeesToDisplay,
  parseDecisions,
  parseActionItems,
  type AttendeeOrg,
  type ActionItem,
} from '../utils/meetingHelpers';
import { Button, Card, Modal, EmptyState, FilterBar, Skeleton, FormField, inputClass, inputClassNoW, inputClassSm } from '../components/ui';
import { AssigneeTagInput } from '../components/AssigneeTagInput';
import { parseAssigneeTokens, serializeAssigneeTokens } from '../utils/assigneeTokens';
import { PageHeader } from '../components/PageHeader';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { applyTextareaTab } from '../utils/textareaTab';
import { useHighlightFromQuery } from '../hooks/useHighlightFromQuery';
import { useCreateForm } from '../hooks/useCreateForm';
import { useCurrentProject } from '../hooks/useCurrentProject';
import type { Meeting, MeetingCategory, Resource } from '../types';

// 논의내용 상단에 삽입하는 'AI 요약' 블록. 재요약 시 기존 블록을 걷어내고 새로 prepend (중복 방지).
const AI_SUMMARY_HEADER = '## 🤖 AI 요약';
const AI_SUMMARY_SEP = '\n\n---\n\n';
function prependAiSummary(orig: string, summary: string): string {
  let base = orig;
  if (base.startsWith(AI_SUMMARY_HEADER)) {
    const idx = base.indexOf(AI_SUMMARY_SEP);
    base = idx >= 0 ? base.slice(idx + AI_SUMMARY_SEP.length) : '';
  }
  const block = `${AI_SUMMARY_HEADER}\n${summary.trim()}`;
  return base.trim().length > 0 ? `${block}${AI_SUMMARY_SEP}${base}` : block;
}

// 회의록 시간은 30분 단위만 — Chromium native time picker 는 분 spinner 에
// step 옵션을 반영하지 않으므로 <select> 로 대체한다.
const HALF_HOUR_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = (i % 2) * 30;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

// 내부=중립 칩, 외부=amber 칩(주의 환기 — 고객·협력사 동반 회의).
function CategoryChip({ category, className = '' }: { category: MeetingCategory; className?: string }) {
  const { t } = useTranslation();
  const external = category === 'External';
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
        external ? 'bg-warning-soft text-on-warning' : 'bg-surface-2 text-muted'
      } ${className}`}
    >
      {t(external ? 'meetings:category.external' : 'meetings:category.internal')}
    </span>
  );
}

function MeetingForm({ projectId, initial, onSave, onCancel }: {
  projectId: number; initial?: Meeting;
  onSave: () => void; onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(initial?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState(initial?.startTime ?? '');
  const [endTime, setEndTime] = useState(initial?.endTime ?? '');
  const [topic, setTopic] = useState(initial?.topic ?? '');
  const [category, setCategory] = useState<MeetingCategory>(initial?.category ?? 'Internal');
  const [discussion, setDiscussion] = useState(initial?.discussion ?? '');
  const [discussionEditing, setDiscussionEditing] = useState(false);
  const discussionRef = useRef<HTMLTextAreaElement | null>(null);

  // 받아쓰기 버튼 — 데스크톱앱(호스트 브릿지)에서만. textarea 포커스 후 Win+H 합성 요청.
  const bridgeAvailable = isHostBridgeAvailable();
  const handleDictation = () => {
    setDiscussionEditing(true); // 프리뷰 → textarea 전환 보장
    setTimeout(() => {
      discussionRef.current?.focus();
      launchDictation();
    }, 60);
  };

  // 'AI 요약' 버튼 — 설정에서 활성화한 경우에만 노출. 로컬 claude CLI 로 논의내용 요약 → 상단 삽입.
  const aiEnabled = loadSettings().aiSummaryEnabled;
  const [aiSummarizing, setAiSummarizing] = useState(false);
  const handleAiSummary = async () => {
    if (!discussion.trim()) { toast.info(t('meetings:form.aiNeedContent')); return; }
    setAiSummarizing(true);
    try {
      const { summary } = await aiApi.summarize(discussion);
      setDiscussion(prependAiSummary(discussion, summary));
      setDiscussionEditing(true);
      toast.success(t('meetings:form.aiAdded'));
    } catch (e) {
      // 서버 오류(claude 실패 등)는 api client 가 이미 토스트 — 네트워크 등 그 외만 보완.
      if (!(e instanceof Error && e.message.startsWith('API error'))) {
        toast.error(t('meetings:form.aiFailed'));
      }
    } finally {
      setAiSummarizing(false);
    }
  };

  const [attendees, setAttendees] = useState<AttendeeOrg[]>(() => {
    const parsed = parseAttendees(initial?.attendees ?? '');
    return parsed.length > 0 ? parsed : [];
  });
  const [legacyAttendees] = useState<string>(() => {
    const parsed = parseAttendees(initial?.attendees ?? '');
    return parsed.length === 0 ? (initial?.attendees ?? '') : '';
  });
  // 참석자 이름 자동완성용 리소스. 폼 마운트(생성/편집 진입) 시 1회 로드.
  const [resources, setResources] = useState<Resource[]>([]);
  useEffect(() => { resourcesApi.getAll().then(setResources).catch(() => {}); }, []);

  const [decisions, setDecisions] = useState<string[]>(() => parseDecisions(initial?.decisions ?? ''));
  const [decisionInput, setDecisionInput] = useState('');
  const [editingDecisionIdx, setEditingDecisionIdx] = useState<number | null>(null);
  const [editingDecisionValue, setEditingDecisionValue] = useState('');

  const [actionItems, setActionItems] = useState<ActionItem[]>(() => parseActionItems(initial?.actionItems ?? ''));
  // 동시성 토큰 (사이클 12) — 충돌 시 [서버 값 보기] 액션으로 갱신.
  const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState<string | undefined>(initial?.updatedAt);
  // dirty 가드 — 모달 닫기 시 변경 손실 확인. [서버 값 보기] 시 setInitialSnapshot 으로 새 기준 적용.
  const [initialSnapshot, setInitialSnapshot] = useState(() => {
    const parsedAtt = parseAttendees(initial?.attendees ?? '');
    return JSON.stringify({
      date: initial?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      startTime: initial?.startTime ?? '',
      endTime: initial?.endTime ?? '',
      topic: initial?.topic ?? '',
      category: initial?.category ?? 'Internal',
      discussion: initial?.discussion ?? '',
      attendees: parsedAtt.length > 0 ? parsedAtt : [],
      decisions: parseDecisions(initial?.decisions ?? ''),
      actionItems: parseActionItems(initial?.actionItems ?? ''),
    });
  });
  const dirty = JSON.stringify({
    date, startTime, endTime, topic, category, discussion, attendees, decisions, actionItems,
  }) !== initialSnapshot;

  const addOrg = () => setAttendees([...attendees, { org: '', members: [] }]);
  const updateOrg = (i: number, k: 'org', v: string) => {
    const next = [...attendees];
    next[i] = { ...next[i], [k]: v };
    setAttendees(next);
  };
  const removeOrg = (i: number) => setAttendees(attendees.filter((_, idx) => idx !== i));
  // 소속 내 인원 — 태그 입력(콤마/엔터 구분)의 결과 배열로 통째 교체.
  const updateOrgMembers = (i: number, members: string[]) => {
    const next = [...attendees];
    next[i] = { ...next[i], members };
    setAttendees(next);
  };

  const addDecision = () => {
    if (!decisionInput.trim()) return;
    setDecisions([...decisions, decisionInput.trim()]);
    setDecisionInput('');
  };
  const removeDecision = (i: number) => setDecisions(decisions.filter((_, idx) => idx !== i));
  const startEditDecision = (i: number) => {
    setEditingDecisionIdx(i);
    setEditingDecisionValue(decisions[i]);
  };
  const commitEditDecision = () => {
    if (editingDecisionIdx == null) return;
    const v = editingDecisionValue.trim();
    setDecisions((prev) =>
      v
        ? prev.map((d, idx) => (idx === editingDecisionIdx ? v : d))
        : prev.filter((_, idx) => idx !== editingDecisionIdx),
    );
    setEditingDecisionIdx(null);
    setEditingDecisionValue('');
  };
  const cancelEditDecision = () => {
    setEditingDecisionIdx(null);
    setEditingDecisionValue('');
  };

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
      category,
      attendees: attendeesPayload,
      topic,
      decisions: decisions.length > 0 ? JSON.stringify(decisions) : '',
      discussion,
      actionItems:
        actionItems.length > 0 ? JSON.stringify(actionItems.filter((a) => a.content.trim())) : '',
      ...(initial ? { updatedAt: snapshotUpdatedAt } : {}),
    };
    if (initial) {
      try {
        await meetingsApi.update(projectId, initial.id, payload, { silent: true });
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('API error 409')) {
          toast.warning(
            t('meetings:form.conflictToast'),
            {
              duration: 8000,
              action: {
                label: t('meetings:form.viewServer'),
                onClick: async () => {
                  const fresh = await meetingsApi.get(projectId, initial.id);
                  setSnapshotUpdatedAt(fresh.updatedAt);
                  const freshDate = fresh.date?.slice(0, 10) ?? '';
                  const freshStart = fresh.startTime ?? '';
                  const freshEnd = fresh.endTime ?? '';
                  const freshTopic = fresh.topic ?? '';
                  const freshCategory = fresh.category ?? 'Internal';
                  const freshDiscussion = fresh.discussion ?? '';
                  const parsedAtt = parseAttendees(fresh.attendees ?? '');
                  const freshAttendees = parsedAtt.length > 0 ? parsedAtt : [];
                  const freshDecisions = parseDecisions(fresh.decisions ?? '');
                  const freshActions = parseActionItems(fresh.actionItems ?? '');
                  setDate(freshDate);
                  setStartTime(freshStart);
                  setEndTime(freshEnd);
                  setTopic(freshTopic);
                  setCategory(freshCategory);
                  setDiscussion(freshDiscussion);
                  setAttendees(freshAttendees);
                  setDecisions(freshDecisions);
                  setActionItems(freshActions);
                  setInitialSnapshot(JSON.stringify({
                    date: freshDate, startTime: freshStart, endTime: freshEnd, topic: freshTopic,
                    category: freshCategory,
                    discussion: freshDiscussion, attendees: freshAttendees,
                    decisions: freshDecisions, actionItems: freshActions,
                  }));
                  toast.info(t('meetings:form.serverFetched'));
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload 리터럴↔CreateMeetingDto 구조 일치, 캐스트만 필요
      await meetingsApi.create(payload as any);
      toast.success(topic.trim() ? t('meetings:toast.created', { topic: topic.trim() }) : t('meetings:toast.createdNoName'));
    }
    onSave();
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title={initial ? t('meetings:form.editTitle') : t('meetings:form.newTitle')}
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
      <div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 min-h-full">
          {/* 좌측 */}
          <div className="space-y-3">
            <div className="grid grid-cols-12 gap-3">
              <FormField label={t('meetings:form.date')} className="col-span-4">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
              </FormField>
              <FormField label={t('meetings:form.time')} className="col-span-8">
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
            </div>

            {/* 제목 전용 행 — 좌측에 내부/외부 세그먼트 토글, 나머지를 제목 input 이 전부 사용. */}
            <FormField label={t('meetings:form.topic')} required>
              <div className="flex items-stretch gap-2">
                <div
                  className="flex shrink-0 rounded-md border border-default overflow-hidden"
                  role="group"
                  aria-label={t('meetings:category.label')}
                >
                  {(['Internal', 'External'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      aria-pressed={category === c}
                      className={`px-3 text-sm whitespace-nowrap transition-colors ${
                        category === c
                          ? 'bg-accent text-on-accent'
                          : 'bg-surface-2 text-muted hover:text-primary'
                      }`}
                    >
                      {t(c === 'External' ? 'meetings:category.external' : 'meetings:category.internal')}
                    </button>
                  ))}
                </div>
                <input value={topic} onChange={(e) => setTopic(e.target.value)} className={inputClass} />
              </div>
            </FormField>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs text-muted font-medium">{t('meetings:form.attendees')}</label>
                <Button variant="ghost" size="sm" onClick={addOrg} leadingIcon={<Building2 size={14} />}>
                  {t('meetings:form.addOrg')}
                </Button>
              </div>
              {legacyAttendees && (
                <p className="text-xs text-muted mb-2">{t('meetings:form.legacyValue', { value: legacyAttendees })}</p>
              )}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {attendees.map((org, i) => (
                  <div key={i} className="border border-default rounded-md p-2 space-y-2">
                    <div className="flex gap-2">
                      <input
                        value={org.org}
                        onChange={(e) => updateOrg(i, 'org', e.target.value)}
                        placeholder={t('meetings:form.orgName')}
                        className={inputClass}
                      />
                      <button onClick={() => removeOrg(i)} className="p-1 text-on-danger hover:opacity-80 transition-opacity" title={t('meetings:form.removeOrg')} aria-label={t('meetings:form.removeOrg')}>
                        <X size={14} />
                      </button>
                    </div>
                    <div className="pl-3">
                      <AssigneeTagInput
                        value={serializeAssigneeTokens(org.members)}
                        onChange={(v) => updateOrgMembers(i, parseAssigneeTokens(v))}
                        resources={resources}
                        placeholder={t('meetings:form.membersPlaceholder')}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-muted font-medium mb-1">{t('meetings:form.decisions')}</label>
              <div className="flex gap-2 mb-2">
                <input
                  value={decisionInput}
                  onChange={(e) => setDecisionInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDecision())}
                  placeholder={t('meetings:form.decisionPlaceholder')}
                  className={inputClass}
                />
                <Button variant="secondary" onClick={addDecision} leadingIcon={<Plus size={16} />}>{t('common:add')}</Button>
              </div>
              <ul className="space-y-1">
                {decisions.map((d, i) => (
                  <li key={i} className="flex items-center justify-between bg-surface-2 px-2 py-1 rounded">
                    {editingDecisionIdx === i ? (
                      <input
                        autoFocus
                        value={editingDecisionValue}
                        onChange={(e) => setEditingDecisionValue(e.target.value)}
                        onBlur={commitEditDecision}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commitEditDecision(); }
                          else if (e.key === 'Escape') { e.preventDefault(); cancelEditDecision(); }
                        }}
                        className={`${inputClassNoW} flex-1 mr-2 text-sm`}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditDecision(i)}
                        className="flex-1 text-left text-sm text-secondary hover:text-primary cursor-text"
                        title={t('meetings:form.clickEdit')}
                      >
                        {d}
                      </button>
                    )}
                    <button onClick={() => removeDecision(i)} className="p-0.5 text-on-danger hover:opacity-80 transition-opacity" title={t('meetings:form.removeDecision')} aria-label={t('meetings:form.removeDecision')}>
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs text-muted font-medium">Action Items</label>
                <Button variant="ghost" size="sm" onClick={addAction} leadingIcon={<Plus size={14} />}>{t('common:add')}</Button>
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
                          placeholder={t('meetings:form.content')}
                          className={inputClass}
                        />
                        <button onClick={() => removeAction(i)} className="p-1 text-on-danger hover:opacity-80 transition-opacity" title={t('meetings:form.removeAction')} aria-label={t('meetings:form.removeAction')}>
                          <X size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={a.assignee}
                          onChange={(e) => updateAction(i, 'assignee', e.target.value)}
                          placeholder={t('meetings:form.assignee')}
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
                              {t('meetings:form.promotedIssue', { id: a.promotedIssueId })}
                            </span>
                          )}
                          {a.promotedWbsItemId != null && (
                            <span className="bg-surface-2 border border-default rounded px-1.5 py-0.5">
                              {t('meetings:form.promotedWbs', { id: a.promotedWbsItemId })}
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
          <FormField label={t('meetings:form.discussion')} className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between gap-2 mb-1 shrink-0">
              <span className="text-xs text-muted">{t('meetings:form.dictationHint')}</span>
              <div className="flex items-center gap-1">
                {bridgeAvailable && (
                  <Button variant="ghost" size="sm" onClick={handleDictation} leadingIcon={<Mic size={14} />}>
                    {t('meetings:form.dictation')}
                  </Button>
                )}
                {aiEnabled && (
                  <Button variant="ghost" size="sm" onClick={handleAiSummary} disabled={aiSummarizing} leadingIcon={<Sparkles size={14} />}>
                    {aiSummarizing ? t('meetings:form.aiSummarizing') : t('meetings:form.aiSummary')}
                  </Button>
                )}
              </div>
            </div>
            {discussionEditing || !discussion ? (
              <textarea
                ref={discussionRef}
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
                className="markdown-body markdown-body--wide flex-1 min-h-0 overflow-y-auto cursor-text bg-surface-2 border border-default rounded-md px-3 py-2 hover:border-strong transition-colors"
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const decisions = parseDecisions(meeting.decisions);
  const actions = parseActionItems(meeting.actionItems);
  // 레거시 평문 폴백 대상 판별: 빈 문자열·공백뿐 아니라 빈 JSON 컨테이너("[]"/"{}")도 제외.
  // (폼 저장은 비어 있으면 '' 를 넣지만, seed/CLI 는 "[]" 를 넣을 수 있어 그대로 렌더하면 "[]" 가 노출됨.)
  const hasLegacyText = (raw?: string) => {
    const s = (raw ?? '').trim();
    return s !== '' && s !== '[]' && s !== '{}';
  };
  const [busy, setBusy] = useState<string | null>(null);

  const promote = async (a: ActionItem, target: 'issue' | 'wbs') => {
    if (!a.content.trim()) {
      toast.error(t('meetings:detail.emptyActionItem'));
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
          toast.success(t('meetings:detail.issueCreatedUnmatched', { id: issue.id, assignee: a.assignee.trim() }));
        } else {
          toast.success(t('meetings:detail.issueCreated', { id: issue.id }));
        }
      } else {
        const item = await meetingsApi.promoteToWbs(projectId, meeting.id, a.id);
        toast.success(t('meetings:detail.wbsCreated', { id: item.id }));
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
          <p className="text-xs text-muted font-medium mb-1">{t('meetings:detail.decisions')}</p>
          <ul className="text-sm text-secondary list-disc pl-5 space-y-0.5">
            {decisions.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>
      )}
      {!decisions.length && hasLegacyText(meeting.decisions) && (
        <div>
          <p className="text-xs text-muted font-medium mb-1">{t('meetings:detail.decisions')}</p>
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
                <th className="text-left pb-1 pr-2 font-medium">{t('meetings:detail.thContent')}</th>
                <th className="text-left pb-1 pr-2 font-medium">{t('meetings:detail.thAssignee')}</th>
                <th className="text-left pb-1 pr-2 font-medium">{t('meetings:detail.thDeadline')}</th>
                <th className="text-right pb-1 font-medium w-48">{t('meetings:detail.thPromote')}</th>
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
                          title={t('meetings:detail.gotoIssue')}
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
                          <AlertTriangle size={12} /> {t('meetings:detail.toIssue')}
                        </button>
                      )}
                      {a.promotedWbsItemId != null ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/projects/${projectId}/wbs?highlight=${a.promotedWbsItemId}`)}
                          className="text-xs bg-surface-2 border border-default rounded px-1.5 py-0.5 hover:border-strong transition-colors"
                          title={t('meetings:detail.gotoWbs')}
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
                          <ListTree size={12} /> {t('meetings:detail.toWbs')}
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
      {!actions.length && hasLegacyText(meeting.actionItems) && (
        <div>
          <p className="text-xs text-muted font-medium mb-1">Action Items</p>
          <p className="text-sm text-secondary whitespace-pre-wrap">{meeting.actionItems}</p>
        </div>
      )}

      {/* 3. 논의 내용 - 마크다운 렌더링 (디테일 패널 폭 전부 사용) */}
      {meeting.discussion && (
        <div>
          <p className="text-xs text-muted font-medium mb-1">{t('meetings:detail.discussion')}</p>
          <div className="markdown-body markdown-body--wide">
            <ReactMarkdown>{meeting.discussion}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

export function MeetingsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = parseInt(projectId!);
  const project = useCurrentProject();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [keyword, setKeyword] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [categoryTab, setCategoryTab] = useState<'all' | MeetingCategory>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // 딥링크(?highlight=:id)로 들어온 회의록은 자동 선택 — 훅이 50ms 뒤 쿼리를 지우므로 첫 렌더에 캡처.
  const [searchParams] = useSearchParams();
  const initialHighlightRef = useRef<number | null>(
    searchParams.get('highlight') ? Number(searchParams.get('highlight')) : null,
  );

  useCreateForm(() => { setEditing(null); setShowForm(true); });

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
    return favoritesFirst(meetings.filter((m) => {
      if (favOnly && !m.isFavorite) return false;
      if (kw) {
        const hay = `${m.topic} ${m.discussion ?? ''} ${m.decisions ?? ''} ${m.actionItems ?? ''} ${m.attendees ?? ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      const d = m.date.slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    }));
  }, [meetings, keyword, favOnly, dateFrom, dateTo]);

  // 즐겨찾기 토글 — 낙관적 갱신 후 영속(실패 시 롤백).
  const toggleFavorite = useCallback((m: Meeting) => {
    const next = !m.isFavorite;
    setMeetings((prev) => prev.map((x) => (x.id === m.id ? { ...x, isFavorite: next } : x)));
    meetingsApi.toggleFavorite(pid, m.id, next).catch(() => {
      setMeetings((prev) => prev.map((x) => (x.id === m.id ? { ...x, isFavorite: !next } : x)));
    });
  }, [pid]);

  // 탭(전체/내부/외부) 적용 + 탭별 건수 배지.
  const tabbed = useMemo(
    () => (categoryTab === 'all' ? filtered : filtered.filter((m) => m.category === categoryTab)),
    [filtered, categoryTab],
  );
  const counts = useMemo(() => ({
    all: filtered.length,
    Internal: filtered.filter((m) => m.category === 'Internal').length,
    External: filtered.filter((m) => m.category === 'External').length,
  }), [filtered]);

  // 선택 유효성 유지 — 필터/탭으로 선택 항목이 사라지면 딥링크 우선, 없으면 첫 항목 자동 선택.
  useEffect(() => {
    if (tabbed.length === 0) { setSelectedId(null); return; }
    setSelectedId((cur) => {
      if (cur != null && tabbed.some((m) => m.id === cur)) return cur;
      const hl = initialHighlightRef.current;
      if (hl != null && tabbed.some((m) => m.id === hl)) return hl;
      return tabbed[0].id;
    });
  }, [tabbed]);

  const selected = useMemo(() => tabbed.find((m) => m.id === selectedId) ?? null, [tabbed, selectedId]);

  // ↑/↓ 로 좌측 목록 선택 이동 (단독 효율 — 키보드 탐색).
  const moveSelection = (dir: 1 | -1) => {
    if (tabbed.length === 0) return;
    const idx = tabbed.findIndex((m) => m.id === selectedId);
    const next = idx === -1 ? 0 : Math.min(tabbed.length - 1, Math.max(0, idx + dir));
    setSelectedId(tabbed[next].id);
  };

  const TAB_DEFS: { key: 'all' | MeetingCategory; label: string; count: number }[] = [
    { key: 'all', label: t('meetings:tabs.all'), count: counts.all },
    { key: 'Internal', label: t('meetings:tabs.internal'), count: counts.Internal },
    { key: 'External', label: t('meetings:tabs.external'), count: counts.External },
  ];

  const handleDelete = async (id: number) => {
    if (!await confirmDialog({
      title: t('meetings:delete.title'),
      message: t('meetings:delete.message'),
      confirmLabel: t('common:delete'),
      danger: true,
    })) return;
    await meetingsApi.delete(pid, id);
    refresh();
  };

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        icon={<FileText size={18} />}
        breadcrumb={project?.name}
        title={t('meetings:title')}
        actions={
          <Button variant="primary" onClick={() => setShowForm(true)} leadingIcon={<Plus size={16} />}>
            {t('meetings:newBtn')}
          </Button>
        }
      />

      <FilterBar>
        <div className="relative w-72">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('meetings:searchPlaceholder')}
            className={`w-full ${inputClassSm} pl-7`}
          />
        </div>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-muted text-xs">{t('meetings:dateLabel')}</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${inputClassSm} w-36`} />
          <span className="text-muted">~</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`${inputClassSm} w-36`} />
        </div>
        <Button
          variant={favOnly ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setFavOnly((v) => !v)}
          leadingIcon={<Star size={14} className={favOnly ? 'fill-current' : ''} />}
        >
          {t('common:favorite.onlyFavorites')}
        </Button>
        {(keyword || dateFrom || dateTo || favOnly) && (
          <Button variant="ghost" size="sm" onClick={() => { setKeyword(''); setDateFrom(''); setDateTo(''); setFavOnly(false); }}>
            {t('common:reset')}
          </Button>
        )}
        <span className="text-xs text-muted ml-auto">{filtered.length} / {meetings.length}</span>
      </FilterBar>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} padding="spacious">
              <Skeleton height={14} width="25%" />
              <Skeleton height={18} width="60%" className="mt-2" />
              <Skeleton height={12} count={2} className="mt-3" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card padding="spacious">
          <EmptyState error={error} onRetry={load} />
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileText size={36} />}
          title={meetings.length === 0 ? t('meetings:empty.titleNone') : t('meetings:empty.titleFiltered')}
          description={meetings.length === 0
            ? t('meetings:empty.descNone')
            : t('meetings:empty.descAdjust')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] gap-4 items-start">
          {/* 좌(1) — 탭 + 선택형 카드 목록 */}
          <div className="space-y-2">
            <div className="flex rounded-md border border-default overflow-hidden text-sm" role="tablist">
              {TAB_DEFS.map((td) => (
                <button
                  key={td.key}
                  type="button"
                  role="tab"
                  aria-selected={categoryTab === td.key}
                  onClick={() => setCategoryTab(td.key)}
                  className={`flex-1 px-2 py-1.5 flex items-center justify-center gap-1.5 transition-colors ${
                    categoryTab === td.key ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted hover:text-primary'
                  }`}
                >
                  <span>{td.label}</span>
                  <span className={`text-xs ${categoryTab === td.key ? 'opacity-80' : 'text-muted'}`}>{td.count}</span>
                </button>
              ))}
            </div>

            <div
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
              }}
              className="space-y-2 outline-none rounded-md focus-visible:ring-1 focus-visible:ring-accent"
            >
              {tabbed.length === 0 ? (
                <p className="text-sm text-muted text-center py-8">{t('meetings:empty.titleFiltered')}</p>
              ) : tabbed.map((m) => (
                <div key={m.id} className="relative">
                  <button
                    type="button"
                    data-highlight-id={m.id}
                    onClick={() => setSelectedId(m.id)}
                    aria-current={selectedId === m.id}
                    className={`w-full text-left rounded-md border px-3 py-2 pr-9 transition-colors ${
                      selectedId === m.id ? 'border-accent bg-accent-soft' : 'border-default bg-surface hover:border-strong'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-secondary font-medium">{m.date.slice(0, 10)}</span>
                      {(m.startTime || m.endTime) && (
                        <span className="text-xs text-muted">
                          {m.startTime ?? ''}{m.startTime && m.endTime ? '–' : ''}{m.endTime ?? ''}
                        </span>
                      )}
                      <CategoryChip category={m.category} className="ml-auto shrink-0" />
                    </div>
                    <h3 className="text-sm font-medium text-primary truncate">{m.topic}</h3>
                    <p className="text-xs text-muted truncate mt-0.5">{attendeesToDisplay(m.attendees)}</p>
                  </button>
                  <div className="absolute top-1.5 right-1">
                    <FavoriteStar active={!!m.isFavorite} onToggle={() => toggleFavorite(m)} size={15} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 우(3) — 선택 회의록 디테일 (펼치기 없이 상시 표시) */}
          <div className="min-w-0">
            {selected ? (
              <Card padding="spacious" data-highlight-id={selected.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm text-secondary font-medium">{selected.date.slice(0, 10)}</span>
                      {(selected.startTime || selected.endTime) && (
                        <span className="text-xs text-muted">
                          {selected.startTime ?? ''}{selected.startTime && selected.endTime ? '–' : ''}{selected.endTime ?? ''}
                        </span>
                      )}
                      <CategoryChip category={selected.category} />
                    </div>
                    <h2 className="h-section">{selected.topic}</h2>
                    {attendeesToDisplay(selected.attendees) && (
                      <p className="text-xs text-muted truncate mt-1">{attendeesToDisplay(selected.attendees)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setEditing(selected)} className="p-1 text-muted hover:text-primary transition-colors" title={t('common:edit')} aria-label={t('meetings:card.editAria', { topic: selected.topic })}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(selected.id)} className="p-1 text-on-danger hover:opacity-80 transition-opacity" title={t('common:delete')} aria-label={t('meetings:card.deleteAria', { topic: selected.topic })}>
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <MeetingDetail meeting={selected} projectId={pid} onChange={refresh} />
              </Card>
            ) : (
              <Card padding="spacious">
                <p className="text-sm text-muted text-center py-12">{t('meetings:detail.selectPrompt')}</p>
              </Card>
            )}
          </div>
        </div>
      )}

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
