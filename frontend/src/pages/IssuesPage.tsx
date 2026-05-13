import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, Plus, Pencil, X, Save } from 'lucide-react';
import { issuesApi } from '../api/issues';
import { resourcesApi } from '../api/resources';
import { Button, Card, Badge, EmptyState, FormField, inputClass } from '../components/ui';
import { issueStatusBadge, issuePriorityBadge } from '../utils/statusMaps';
import type { Issue, IssueStatus, IssuePriority, Resource } from '../types';

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
      <Card padding="spacious" className="w-full max-w-2xl my-4 space-y-3">
        <h2 className="h-section">{initial ? '이슈 수정' : '이슈 등록'}</h2>
        <FormField label="제목" required>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputClass} />
        </FormField>

        <div className="grid grid-cols-3 gap-3">
          <FormField label="상태">
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as IssueStatus }))} className={inputClass}>
              {(['Open', 'InProgress', 'Resolved', 'Closed'] as IssueStatus[]).map((s) => (
                <option key={s} value={s}>{issueStatusBadge[s].label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="우선순위">
            <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as IssuePriority }))} className={inputClass}>
              {(['High', 'Medium', 'Low'] as IssuePriority[]).map((p) => (
                <option key={p} value={p}>{issuePriorityBadge[p].label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="마감일">
            <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className={inputClass} />
          </FormField>
        </div>

        <FormField label="담당자 (리소스)">
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
        </FormField>

        <FormField label="설명">
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={6}
            className={`${inputClass} resize-none`}
          />
        </FormField>

        <div className="flex gap-2 justify-end pt-3 border-t border-default">
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>취소</Button>
          <Button variant="primary" onClick={handleSubmit} leadingIcon={<Save size={16} />}>저장</Button>
        </div>
      </Card>
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h-page flex items-center gap-2">
          <AlertTriangle size={18} className="text-muted" />
          이슈 관리
        </h1>
        <Button variant="primary" onClick={() => setShowForm(true)} leadingIcon={<Plus size={16} />}>
          이슈 등록
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button variant={filter === 'All' ? 'primary' : 'secondary'} size="sm" onClick={() => setFilter('All')}>
          전체 ({issues.length})
        </Button>
        {(['Open', 'InProgress', 'Resolved', 'Closed'] as IssueStatus[]).map((s) => {
          const count = issues.filter((i) => i.status === s).length;
          return (
            <Button
              key={s}
              variant={filter === s ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setFilter(s)}
            >
              {issueStatusBadge[s].label} ({count})
            </Button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<AlertTriangle size={40} />}
            title="이슈가 없습니다."
            description={filter === 'All' ? '우측 상단 \'이슈 등록\' 버튼으로 새 이슈를 만들어보세요.' : '해당 상태의 이슈가 없습니다.'}
          />
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-muted border-b border-default">
                <th className="text-left py-3 px-4 font-medium">제목</th>
                <th className="text-left py-3 px-3 font-medium">상태</th>
                <th className="text-left py-3 px-3 font-medium">우선순위</th>
                <th className="text-left py-3 px-3 font-medium">담당자</th>
                <th className="text-left py-3 px-3 font-medium">마감일</th>
                <th className="text-left py-3 px-3 font-medium">작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => {
                const status = issueStatusBadge[it.status];
                const priority = issuePriorityBadge[it.priority];
                return (
                  <tr
                    key={it.id}
                    className="border-b border-default last:border-0 hover:bg-surface-2 cursor-pointer transition-colors"
                    onClick={() => setEditing(it)}
                  >
                    <td className="py-2 px-4">
                      <p className="text-sm text-primary font-medium">{it.title}</p>
                      {it.description && <p className="text-xs text-muted line-clamp-1 mt-0.5">{it.description}</p>}
                    </td>
                    <td className="py-2 px-3">
                      <Badge variant={status.variant} size="sm">{status.label}</Badge>
                    </td>
                    <td className="py-2 px-3">
                      <Badge variant={priority.variant} size="sm">{priority.label}</Badge>
                    </td>
                    <td className="py-2 px-3 text-sm text-secondary">{it.assigneeName || '-'}</td>
                    <td className="py-2 px-3 text-xs text-muted">{it.dueDate?.slice(0, 10) ?? '-'}</td>
                    <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditing(it)} className="p-1 text-muted hover:text-primary transition-colors" title="수정">
                          <Pencil size={14} />
                        </button>
                        <button onClick={(e) => handleDelete(it.id, e)} className="p-1 text-on-danger hover:opacity-80 transition-opacity" title="삭제">
                          <X size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

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
