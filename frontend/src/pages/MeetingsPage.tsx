import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { Plus, Pencil, X, Save, FileText, Building2, UserPlus } from 'lucide-react';
import { meetingsApi } from '../api/meetings';
import {
  parseAttendees,
  attendeesToDisplay,
  parseDecisions,
  parseActionItems,
  type AttendeeOrg,
  type ActionItem,
} from '../utils/meetingHelpers';
import type { Meeting } from '../types';

function MeetingForm({ projectId, initial, onSave, onCancel }: {
  projectId: number; initial?: Meeting;
  onSave: () => void; onCancel: () => void;
}) {
  const [date, setDate] = useState(initial?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
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

  const inputClass =
    'w-full bg-zinc-800/60 border border-zinc-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-zinc-500';

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

  const addAction = () => setActionItems([...actionItems, { content: '', assignee: '', deadline: '' }]);
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
      attendees: attendeesPayload,
      topic,
      decisions: decisions.length > 0 ? JSON.stringify(decisions) : '',
      discussion,
      actionItems:
        actionItems.length > 0 ? JSON.stringify(actionItems.filter((a) => a.content.trim())) : '',
    };
    if (initial) await meetingsApi.update(projectId, initial.id, payload);
    else await meetingsApi.create(payload as any);
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#1f1f1f] rounded-lg p-6 w-full max-w-4xl border border-[#2a2a2a] my-4">
        <h2 className="text-base font-medium text-slate-100 mb-5">{initial ? '회의록 수정' : '회의록 작성'}</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 좌측 */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">날짜</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">주제 *</label>
                <input value={topic} onChange={(e) => setTopic(e.target.value)} className={inputClass} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs text-slate-400">참석자 (소속별)</label>
                <button
                  onClick={addOrg}
                  className="flex items-center gap-1 text-xs text-slate-300 hover:text-white"
                >
                  <Building2 size={12} /> 소속 추가
                </button>
              </div>
              {legacyAttendees && (
                <p className="text-xs text-slate-500 mb-2">기존 값: {legacyAttendees}</p>
              )}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {attendees.map((org, i) => (
                  <div key={i} className="border border-zinc-700 rounded-md p-2 space-y-2">
                    <div className="flex gap-2">
                      <input
                        value={org.org}
                        onChange={(e) => updateOrg(i, 'org', e.target.value)}
                        placeholder="소속명"
                        className={inputClass}
                      />
                      <button onClick={() => removeOrg(i)} className="p-1 text-red-400 hover:text-red-300" title="소속 삭제">
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
                        <button onClick={() => removeMember(i, j)} className="p-1 text-red-400 hover:text-red-300" title="삭제">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addMember(i)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 ml-3"
                    >
                      <UserPlus size={12} /> 인원 추가
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">주요 결정사항</label>
              <div className="flex gap-2 mb-2">
                <input
                  value={decisionInput}
                  onChange={(e) => setDecisionInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDecision())}
                  placeholder="결정사항 입력 후 추가"
                  className={inputClass}
                />
                <button
                  onClick={addDecision}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 text-slate-200 rounded-md"
                >
                  <Plus size={14} /> 추가
                </button>
              </div>
              <ul className="space-y-1">
                {decisions.map((d, i) => (
                  <li key={i} className="flex items-center justify-between bg-zinc-800/40 px-2 py-1 rounded">
                    <span className="text-sm text-slate-200">{d}</span>
                    <button onClick={() => removeDecision(i)} className="p-0.5 text-red-400 hover:text-red-300">
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs text-slate-400">Action Items</label>
                <button onClick={addAction} className="flex items-center gap-1 text-xs text-slate-300 hover:text-white">
                  <Plus size={12} /> 추가
                </button>
              </div>
              <div className="space-y-2">
                {actionItems.map((a, i) => (
                  <div key={i} className="border border-zinc-700 rounded-md p-2 space-y-2">
                    <div className="flex gap-2">
                      <input
                        value={a.content}
                        onChange={(e) => updateAction(i, 'content', e.target.value)}
                        placeholder="내용"
                        className={inputClass}
                      />
                      <button onClick={() => removeAction(i)} className="p-1 text-red-400 hover:text-red-300">
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
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 우측 - 논의 내용 (마크다운) */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">논의 내용 (마크다운 지원, 포커스 아웃 시 렌더링)</label>
            {discussionEditing || !discussion ? (
              <textarea
                value={discussion}
                onChange={(e) => setDiscussion(e.target.value)}
                onFocus={() => setDiscussionEditing(true)}
                onBlur={() => setDiscussionEditing(false)}
                rows={28}
                className={`${inputClass} resize-none font-mono`}
                autoFocus={discussionEditing}
              />
            ) : (
              <div
                onClick={() => setDiscussionEditing(true)}
                className="markdown-body min-h-[400px] cursor-text bg-zinc-800/60 border border-zinc-700 rounded-md px-3 py-2 hover:border-zinc-500"
              >
                <ReactMarkdown>{discussion}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-5 mt-5 border-t border-[#2a2a2a]">
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

function MeetingDetail({ meeting }: { meeting: Meeting }) {
  const decisions = parseDecisions(meeting.decisions);
  const actions = parseActionItems(meeting.actionItems);

  return (
    <div className="mt-4 pt-4 border-t border-[#2a2a2a] space-y-4">
      {/* 1. 주요 결정사항 */}
      {decisions.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 font-medium mb-1">주요 결정사항</p>
          <ul className="text-sm text-slate-200 list-disc pl-5 space-y-0.5">
            {decisions.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>
      )}
      {!decisions.length && meeting.decisions && (
        <div>
          <p className="text-xs text-slate-400 font-medium mb-1">주요 결정사항</p>
          <p className="text-sm text-slate-200 whitespace-pre-wrap">{meeting.decisions}</p>
        </div>
      )}

      {/* 2. Action Items */}
      {actions.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 font-medium mb-1">Action Items</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400">
                <th className="text-left pb-1 pr-2 font-medium">내용</th>
                <th className="text-left pb-1 pr-2 font-medium">담당자</th>
                <th className="text-left pb-1 font-medium">기한</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a, i) => (
                <tr key={i} className="border-t border-[#2a2a2a]">
                  <td className="py-1 pr-2 text-slate-200">{a.content}</td>
                  <td className="py-1 pr-2 text-slate-300">{a.assignee}</td>
                  <td className="py-1 text-slate-400">{a.deadline}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!actions.length && meeting.actionItems && (
        <div>
          <p className="text-xs text-slate-400 font-medium mb-1">Action Items</p>
          <p className="text-sm text-slate-200 whitespace-pre-wrap">{meeting.actionItems}</p>
        </div>
      )}

      {/* 3. 논의 내용 - 마크다운 렌더링 */}
      {meeting.discussion && (
        <div>
          <p className="text-xs text-slate-400 font-medium mb-1">논의 내용</p>
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
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = (kw?: string) => meetingsApi.getByProject(pid, kw).then(setMeetings);
  useEffect(() => { load(); }, [pid]);

  const handleDelete = async (id: number) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await meetingsApi.delete(pid, id);
    load(keyword || undefined);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <FileText size={18} className="text-slate-400" />
          회의록
        </h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-medium transition-colors"
        >
          <Plus size={14} /> 회의록 작성
        </button>
      </div>

      <div className="flex gap-2">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="키워드 검색..."
          onKeyDown={(e) => e.key === 'Enter' && load(keyword || undefined)}
          className="flex-1 bg-[#1f1f1f] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-zinc-500"
        />
        <button onClick={() => load(keyword || undefined)} className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-slate-200 rounded-md text-sm">
          검색
        </button>
        <button onClick={() => { setKeyword(''); load(); }} className="px-3 py-2 text-slate-400 hover:text-slate-200 text-sm">
          초기화
        </button>
      </div>

      <div className="space-y-3">
        {meetings.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <FileText size={36} className="mx-auto mb-2 text-slate-600" />
            <p className="text-sm">회의록이 없습니다.</p>
          </div>
        ) : meetings.map((m) => (
          <div key={m.id} className="bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-zinc-300 font-medium">{m.date.slice(0, 10)}</span>
                  <span className="text-xs text-slate-500">|</span>
                  <span className="text-xs text-slate-400 truncate">{attendeesToDisplay(m.attendees)}</span>
                </div>
                <h3
                  className="text-base font-medium text-slate-100 hover:text-zinc-300 cursor-pointer"
                  onClick={() => setEditing(m)}
                >
                  {m.topic}
                </h3>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setEditing(m)} className="p-1 text-slate-400 hover:text-slate-200" title="수정">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(m.id)} className="p-1 text-red-400 hover:text-red-300" title="삭제">
                  <X size={14} />
                </button>
                <button
                  onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                  className="px-2 text-xs text-slate-400 hover:text-slate-200"
                >
                  {expanded === m.id ? '접기' : '펼치기'}
                </button>
              </div>
            </div>
            {expanded === m.id && <MeetingDetail meeting={m} />}
          </div>
        ))}
      </div>

      {showForm && (
        <MeetingForm
          projectId={pid}
          onSave={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {editing && (
        <MeetingForm
          projectId={pid}
          initial={editing}
          onSave={() => { setEditing(null); load(); }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
