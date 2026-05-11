import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, Plus, Pencil, X, Save } from 'lucide-react';
import { issuesApi } from '../api/issues';
import { resourcesApi } from '../api/resources';
import type { Issue, IssueStatus, IssuePriority, Resource } from '../types';

const statusLabel: Record<IssueStatus, string> = {
  Open: '열림', InProgress: '진행중', Resolved: '해결됨', Closed: '닫힘',
};
const statusBadge: Record<IssueStatus, string> = {
  Open: 'bg-red-500/15 text-red-300',
  InProgress: 'bg-amber-500/15 text-amber-300',
  Resolved: 'bg-emerald-500/15 text-emerald-300',
  Closed: 'bg-zinc-700/40 text-slate-300',
};
const priorityLabel: Record<IssuePriority, string> = { High: '높음', Medium: '중간', Low: '낮음' };
const priorityBadge: Record<IssuePriority, string> = {
  High: 'bg-red-500/15 text-red-300',
  Medium: 'bg-amber-500/15 text-amber-300',
  Low: 'bg-slate-500/15 text-slate-300',
};

function IssueForm({ projectId, initial, resources, onSave, onCancel }: {
  projectId: number; initial?: Issue; resources: Resource[];
  onSave: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    status: (initial?.status ?? 'Open') as IssueStatus,
    priority: (initial?.priority ?? 'Medium') as IssuePriority,
    assigneeResourceId: initial?.assigneeResourceId ?? null,
    dueDate: initial?.dueDate?.slice(0, 10) ?? '',
  });

  const inputClass =
    'w-full bg-zinc-800/60 border border-zinc-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-zinc-500';

  const handleSubmit = async () => {
    const payload = {
      projectId,
      title: form.title,
      description: form.description,
      status: form.status,
      priority: form.priority,
      assigneeResourceId: form.assigneeResourceId ? Number(form.assigneeResourceId) : null,
      dueDate: form.dueDate || null,
    };
    if (initial) await issuesApi.update(projectId, initial.id, payload as any);
    else await issuesApi.create(payload as any);
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#1f1f1f] rounded-lg p-6 w-full max-w-2xl border border-[#2a2a2a] my-4 space-y-3">
        <h2 className="text-base font-medium text-slate-100">{initial ? '이슈 수정' : '이슈 등록'}</h2>
        <div>
          <label className="block text-xs text-slate-400 mb-1">제목 *</label>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputClass} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">상태</label>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as IssueStatus }))} className={inputClass}>
              {(['Open', 'InProgress', 'Resolved', 'Closed'] as IssueStatus[]).map((s) => (
                <option key={s} value={s}>{statusLabel[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">우선순위</label>
            <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as IssuePriority }))} className={inputClass}>
              {(['High', 'Medium', 'Low'] as IssuePriority[]).map((p) => (
                <option key={p} value={p}>{priorityLabel[p]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">마감일</label>
            <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className={inputClass} />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">담당자 (리소스)</label>
          <select
            value={form.assigneeResourceId ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, assigneeResourceId: e.target.value ? Number(e.target.value) : null }))}
            className={inputClass}
          >
            <option value="">-- 미지정 --</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}{r.department ? ` (${r.department})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">설명</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={6}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div className="flex gap-2 justify-end pt-3 border-t border-[#2a2a2a]">
          <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-zinc-800 hover:bg-zinc-700 text-slate-200 transition-colors">
            <X size={14} /> 취소
          </button>
          <button onClick={handleSubmit} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-zinc-700 hover:bg-zinc-600 text-white transition-colors">
            <Save size={14} /> 저장
          </button>
        </div>
      </div>
    </div>
  );
}

export function IssuesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = parseInt(projectId!);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Issue | null>(null);
  const [filter, setFilter] = useState<IssueStatus | 'All'>('All');

  const load = () => issuesApi.getByProject(pid).then(setIssues);

  useEffect(() => {
    load();
    resourcesApi.getAll().then(setResources).catch(() => setResources([]));
  }, [pid]);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 이슈를 삭제하시겠습니까?')) return;
    await issuesApi.delete(pid, id);
    load();
  };

  const filtered = filter === 'All' ? issues : issues.filter((i) => i.status === filter);
  const filterBtn = (active: boolean) =>
    `px-3 py-1.5 rounded-md text-sm transition-colors ${
      active ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-slate-300 hover:bg-zinc-700'
    }`;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <AlertTriangle size={18} className="text-slate-400" />
          이슈 관리
        </h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-md text-sm font-medium transition-colors"
        >
          <Plus size={14} /> 이슈 등록
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilter('All')} className={filterBtn(filter === 'All')}>전체 ({issues.length})</button>
        {(['Open', 'InProgress', 'Resolved', 'Closed'] as IssueStatus[]).map((s) => {
          const count = issues.filter((i) => i.status === s).length;
          return (
            <button key={s} onClick={() => setFilter(s)} className={filterBtn(filter === s)}>
              {statusLabel[s]} ({count})
            </button>
          );
        })}
      </div>

      <div className="bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <AlertTriangle size={36} className="mx-auto mb-2 text-slate-600" />
            <p className="text-sm">이슈가 없습니다.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-[#2a2a2a]">
                <th className="text-left py-3 px-4 font-medium">제목</th>
                <th className="text-left py-3 px-3 font-medium">상태</th>
                <th className="text-left py-3 px-3 font-medium">우선순위</th>
                <th className="text-left py-3 px-3 font-medium">담당자</th>
                <th className="text-left py-3 px-3 font-medium">마감일</th>
                <th className="text-left py-3 px-3 font-medium">작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr
                  key={it.id}
                  className="border-b border-[#2a2a2a] last:border-0 hover:bg-zinc-800/30 cursor-pointer"
                  onClick={() => setEditing(it)}
                >
                  <td className="py-2 px-4">
                    <p className="text-sm text-slate-100 font-medium">{it.title}</p>
                    {it.description && <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{it.description}</p>}
                  </td>
                  <td className="py-2 px-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${statusBadge[it.status]}`}>{statusLabel[it.status]}</span>
                  </td>
                  <td className="py-2 px-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${priorityBadge[it.priority]}`}>{priorityLabel[it.priority]}</span>
                  </td>
                  <td className="py-2 px-3 text-sm text-slate-300">{it.assigneeName || '-'}</td>
                  <td className="py-2 px-3 text-xs text-slate-400">{it.dueDate?.slice(0, 10) ?? '-'}</td>
                  <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditing(it)} className="p-1 text-slate-400 hover:text-slate-200" title="수정">
                        <Pencil size={14} />
                      </button>
                      <button onClick={(e) => handleDelete(it.id, e)} className="p-1 text-red-400 hover:text-red-300" title="삭제">
                        <X size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <IssueForm
          projectId={pid}
          resources={resources}
          onSave={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {editing && (
        <IssueForm
          projectId={pid}
          initial={editing}
          resources={resources}
          onSave={() => { setEditing(null); load(); }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
