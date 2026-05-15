import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { AlertTriangle, ChevronDown, ChevronRight, Plus, Search, X } from 'lucide-react';
import { issuesApi } from '../api/issues';
import { resourcesApi } from '../api/resources';
import { Button, Card, BadgeMenu, EmptyState, inputClass, inputClassNoW, type BadgeMenuOption } from '../components/ui';
import { issueStatusBadge, issuePriorityBadge } from '../utils/statusMaps';
import { applyTextareaTab } from '../utils/textareaTab';
import { useHighlightFromQuery } from '../hooks/useHighlightFromQuery';
import type { Issue, IssueStatus, IssuePriority, Resource } from '../types';

const STATUS_VALUES: IssueStatus[] = ['Open', 'InProgress', 'Resolved', 'Closed'];
const PRIORITY_VALUES: IssuePriority[] = ['High', 'Medium', 'Low'];

const STATUS_OPTIONS: BadgeMenuOption<IssueStatus>[] = STATUS_VALUES.map((s) => ({
  value: s, label: issueStatusBadge[s].label, variant: issueStatusBadge[s].variant,
}));
const PRIORITY_OPTIONS: BadgeMenuOption<IssuePriority>[] = PRIORITY_VALUES.map((p) => ({
  value: p, label: issuePriorityBadge[p].label, variant: issuePriorityBadge[p].variant,
}));

export function IssuesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = parseInt(projectId!);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [filter, setFilter] = useState<IssueStatus | 'All'>('All');
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | 'All'>('All');
  const [assigneeFilter, setAssigneeFilter] = useState<number | 'All' | 'Unassigned'>('All');
  const [keyword, setKeyword] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const load = () => issuesApi.getByProject(pid).then(setIssues);

  useEffect(() => {
    load();
    resourcesApi.getAll().then(setResources).catch(() => setResources([]));
  }, [pid]);

  useHighlightFromQuery([issues.length]);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 이슈를 삭제하시겠습니까?')) return;
    await issuesApi.delete(pid, id);
    if (expanded === id) setExpanded(null);
    load();
  };

  // 옵티미스틱 업데이트 후 백엔드에 PUT 전송.
  // 백엔드 PUT 은 assigneeName 을 응답으로 채우므로 페이로드에서 빼고 보낸다.
  const updateField = async <K extends keyof Issue>(id: number, key: K, value: Issue[K]) => {
    const target = issues.find((i) => i.id === id);
    if (!target || target[key] === value) return;
    const next = { ...target, [key]: value };
    setIssues((prev) => prev.map((i) => (i.id === id ? next : i)));
    const { assigneeName: _ignored, ...payload } = next;
    await issuesApi.update(pid, id, payload as Partial<Issue>);
  };

  const handleQuickCreate = async () => {
    const title = newTitle.trim();
    if (!title) return;
    await issuesApi.create({
      projectId: pid,
      title,
      description: '',
      status: 'Open',
      priority: 'Medium',
      assigneeResourceId: null,
      dueDate: undefined,
    });
    setNewTitle('');
    load();
  };

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return issues.filter((i) => {
      if (filter !== 'All' && i.status !== filter) return false;
      if (priorityFilter !== 'All' && i.priority !== priorityFilter) return false;
      if (assigneeFilter === 'Unassigned' && i.assigneeResourceId != null) return false;
      if (typeof assigneeFilter === 'number' && i.assigneeResourceId !== assigneeFilter) return false;
      if (kw) {
        const hay = `${i.title} ${i.description ?? ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [issues, filter, priorityFilter, assigneeFilter, keyword]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h-page flex items-center gap-2">
          <AlertTriangle size={18} className="text-muted" />
          이슈 관리
        </h1>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap items-center">
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

        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative w-56">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="제목·설명 검색…"
              className={`${inputClass} pl-7 py-1.5 text-sm`}
            />
          </div>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as IssuePriority | 'All')}
            className={`${inputClassNoW} py-1.5 text-sm w-32`}
          >
            <option value="All">우선순위 전체</option>
            {PRIORITY_VALUES.map((p) => (
              <option key={p} value={p}>{issuePriorityBadge[p].label}</option>
            ))}
          </select>
          <select
            value={String(assigneeFilter)}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'All' || v === 'Unassigned') setAssigneeFilter(v);
              else setAssigneeFilter(Number(v));
            }}
            className={`${inputClassNoW} py-1.5 text-sm w-40`}
          >
            <option value="All">담당자 전체</option>
            <option value="Unassigned">미지정만</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          {(keyword || priorityFilter !== 'All' || assigneeFilter !== 'All' || filter !== 'All') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setKeyword('');
                setPriorityFilter('All');
                setAssigneeFilter('All');
                setFilter('All');
              }}
            >
              필터 초기화
            </Button>
          )}
        </div>
      </div>

      <Card padding="none" className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-muted border-b border-default">
              <th className="text-left py-3 px-4 font-medium w-10"></th>
              <th className="text-left py-3 px-3 font-medium">제목</th>
              <th className="text-left py-3 px-3 font-medium w-28">상태</th>
              <th className="text-left py-3 px-3 font-medium w-24">우선순위</th>
              <th className="text-left py-3 px-3 font-medium w-48">담당자</th>
              <th className="text-left py-3 px-3 font-medium w-36">마감일</th>
              <th className="text-left py-3 px-3 font-medium w-16"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-0">
                  <EmptyState
                    icon={<AlertTriangle size={36} />}
                    title="이슈가 없습니다."
                    description={
                      filter === 'All' && priorityFilter === 'All' && assigneeFilter === 'All' && !keyword
                        ? '아래 빈 행에서 제목을 입력해 빠르게 추가할 수 있습니다.'
                        : '조건에 맞는 이슈가 없습니다. 필터를 초기화해 보세요.'
                    }
                  />
                </td>
              </tr>
            )}
            {filtered.map((it) => (
              <IssueRow
                key={it.id}
                issue={it}
                resources={resources}
                expanded={expanded === it.id}
                onToggleExpand={() => setExpanded((prev) => (prev === it.id ? null : it.id))}
                onUpdate={updateField}
                onDelete={handleDelete}
              />
            ))}

            {/* 마지막 빈 행 — 제목 + Enter / 추가 버튼으로 빠르게 신규 생성 */}
            <tr className="bg-surface-2/30">
              <td className="py-2 px-4 text-muted">
                <Plus size={14} />
              </td>
              <td className="py-2 px-3" colSpan={5}>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleQuickCreate(); }}
                  placeholder="새 이슈 제목 입력 후 Enter…"
                  className="w-full bg-transparent text-sm text-primary placeholder:text-muted/70 focus:outline-none border-none px-0 py-0"
                />
              </td>
              <td className="py-2 px-3">
                <Button variant="ghost" size="sm" onClick={handleQuickCreate}>
                  추가
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function IssueRow({
  issue, resources, expanded, onToggleExpand, onUpdate, onDelete,
}: {
  issue: Issue;
  resources: Resource[];
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: <K extends keyof Issue>(id: number, key: K, value: Issue[K]) => void;
  onDelete: (id: number, e: React.MouseEvent) => void;
}) {
  const [title, setTitle] = useState(issue.title);
  const [dueDate, setDueDate] = useState(issue.dueDate?.slice(0, 10) ?? '');

  useEffect(() => { setTitle(issue.title); }, [issue.title]);
  useEffect(() => { setDueDate(issue.dueDate?.slice(0, 10) ?? ''); }, [issue.dueDate]);

  return (
    <>
      <tr data-highlight-id={issue.id} className="border-b border-default last:border-0 hover:bg-surface-2 transition-colors">
        <td className="py-2 px-4">
          <button
            type="button"
            onClick={onToggleExpand}
            className="text-muted hover:text-primary transition-colors"
            title={expanded ? '접기' : '펼치기'}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
        <td className="py-2 px-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => onUpdate(issue.id, 'title', title)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="w-full bg-transparent text-sm text-primary font-medium focus:outline-none focus:bg-surface-2 rounded px-1.5 py-1 transition-colors border border-transparent focus:border-default"
          />
        </td>
        <td className="py-2 px-3">
          <BadgeMenu<IssueStatus>
            value={issue.status}
            options={STATUS_OPTIONS}
            onChange={(next) => onUpdate(issue.id, 'status', next)}
            title="상태 변경"
          />
        </td>
        <td className="py-2 px-3">
          <BadgeMenu<IssuePriority>
            value={issue.priority}
            options={PRIORITY_OPTIONS}
            onChange={(next) => onUpdate(issue.id, 'priority', next)}
            title="우선순위 변경"
          />
        </td>
        <td className="py-2 px-3">
          <select
            value={issue.assigneeResourceId ?? ''}
            onChange={(e) => onUpdate(issue.id, 'assigneeResourceId', e.target.value ? Number(e.target.value) : null)}
            className={`${inputClass} py-1 text-xs`}
          >
            <option value="">-- 미지정 --</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}{r.department ? ` (${r.department})` : ''}
              </option>
            ))}
          </select>
        </td>
        <td className="py-2 px-3">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            onBlur={() => onUpdate(issue.id, 'dueDate', dueDate || undefined)}
            className={`${inputClass} py-1 text-xs`}
          />
        </td>
        <td className="py-2 px-3">
          <button
            onClick={(e) => onDelete(issue.id, e)}
            className="p-1 text-on-danger hover:opacity-80 transition-opacity"
            title="삭제"
          >
            <X size={14} />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-default bg-surface-2/30">
          <td />
          <td colSpan={6} className="py-3 px-3 pr-4">
            <p className="text-xs text-muted font-medium mb-1">설명 (마크다운, 포커스 아웃 시 렌더링)</p>
            <DescriptionField
              value={issue.description ?? ''}
              onSave={(next) => onUpdate(issue.id, 'description', next)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function DescriptionField({ value, onSave }: { value: string; onSave: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  if (editing || !value) {
    return (
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => applyTextareaTab(e, setDraft)}
        onFocus={() => setEditing(true)}
        onBlur={() => { setEditing(false); if (draft !== value) onSave(draft); }}
        rows={8}
        className={`${inputClass} resize-y font-mono`}
        placeholder="이슈 상세 설명 (마크다운 지원)"
        autoFocus={editing}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="markdown-body min-h-[120px] cursor-text bg-surface-2 border border-default rounded-md px-3 py-2 hover:border-strong transition-colors"
    >
      <ReactMarkdown>{value}</ReactMarkdown>
    </div>
  );
}
