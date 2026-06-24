import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { SquareCheck, Plus, X, Save, Circle, CheckCircle2, Repeat, ListChecks, Bug } from 'lucide-react';
import { todosApi } from '../api/todos';
import { Button, Card, Modal, Badge, EmptyState, FilterBar, FormField, Spinner, inputClass } from '../components/ui';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { loadSettings } from '../store/settings';
import { useCreateForm } from '../hooks/useCreateForm';
import { wbsStatusBadge, issueStatusBadge, issuePriorityBadge, wbsImportanceBadge } from '../utils/statusMaps';
import { groupMyWork, dueDisplay, type TodoBucket, type DueTone } from '../utils/todoView';
import { formatDateShort } from '../i18n/format';
import type { MyWorkItem, TodoItem, TodoRecurrence, WbsStatus, IssueStatus, IssuePriority } from '../types';

const RECURRENCES: TodoRecurrence[] = ['None', 'Daily', 'Weekly', 'Monthly', 'Yearly'];

function todayIso(): string {
  // 로컬 날짜(YYYY-MM-DD). new Date().toISOString() 은 UTC 라 자정 부근에 하루 어긋날 수 있어 로컬 기준으로.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 독립 TODO 생성/편집 모달.
function TodoForm({ initial, defaultAssignee, onSave, onCancel }: {
  initial?: TodoItem;
  defaultAssignee: number | null;
  onSave: (data: Partial<TodoItem>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const initialForm = {
    title: initial?.title ?? '',
    notes: initial?.notes ?? '',
    dueDate: initial?.dueDate?.slice(0, 10) ?? '',
    recurrence: (initial?.recurrence ?? 'None') as TodoRecurrence,
    recurrenceInterval: (initial?.recurrenceInterval ?? 1).toString(),
  };
  const [form, setForm] = useState(initialForm);
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.title.trim()) { toast.warning(t('todos:form.titleRequired')); return; }
    onSave({
      title: form.title.trim(),
      notes: form.notes,
      dueDate: form.dueDate || undefined,
      recurrence: form.recurrence,
      recurrenceInterval: Math.max(1, parseInt(form.recurrenceInterval) || 1),
      ...(initial ? {} : (defaultAssignee != null ? { assigneeResourceId: defaultAssignee } : {})),
    });
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title={initial ? t('todos:form.editTitle') : t('todos:form.newTitle')}
      size="md"
      dirty={dirty}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>{t('common:cancel')}</Button>
          <Button variant="primary" onClick={submit} leadingIcon={<Save size={16} />}>{t('common:save')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label={t('todos:form.titleLabel')} required>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputClass} autoFocus />
        </FormField>
        <FormField label={t('todos:form.due')}>
          <input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} className={inputClass} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('todos:form.recurrence')} hint={t('todos:form.recurrenceHint')}>
            <select value={form.recurrence} onChange={(e) => set('recurrence', e.target.value)} className={inputClass}>
              {RECURRENCES.map((r) => (
                <option key={r} value={r}>{t(`todos:recurrence.${r}`)}</option>
              ))}
            </select>
          </FormField>
          {form.recurrence !== 'None' && (
            <FormField label={t('todos:form.interval')}>
              <input
                type="number" min={1}
                value={form.recurrenceInterval}
                onChange={(e) => set('recurrenceInterval', e.target.value)}
                className={inputClass}
              />
            </FormField>
          )}
        </div>
        <FormField label={t('todos:form.notes')}>
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className={`${inputClass} resize-none`} />
        </FormField>
      </div>
    </Modal>
  );
}

function sourceMeta(sourceType: MyWorkItem['sourceType']) {
  switch (sourceType) {
    case 'wbs': return { icon: <ListChecks size={14} />, variant: 'info' as const, key: 'wbs' };
    case 'issue': return { icon: <Bug size={14} />, variant: 'warning' as const, key: 'issue' };
    default: return { icon: <SquareCheck size={14} />, variant: 'neutral' as const, key: 'todo' };
  }
}

const groupTone: Record<TodoBucket, string> = {
  overdue: 'text-on-danger',
  today: 'text-accent',
  upcoming: 'text-secondary',
  noDue: 'text-muted',
};

const dueToneClass: Record<DueTone, string> = {
  danger: 'text-on-danger',
  warning: 'text-on-warning',
  muted: 'text-muted',
};

export function TodosPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const myResourceId = loadSettings().myResourceId ?? null;

  // myResourceId 가 없으면 '내 업무' 필터가 무의미하므로 기본 '전체'.
  const [scope, setScope] = useState<'mine' | 'all'>(myResourceId != null ? 'mine' : 'all');
  const [items, setItems] = useState<MyWorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TodoItem | null>(null);

  useCreateForm(() => { setEditing(null); setShowForm(true); });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const assignee = scope === 'mine' ? myResourceId : null;
      const data = await todosApi.myWork(assignee);
      setItems(data.items);
      setError('');
    } catch {
      setError(t('todos:error.load'));
    } finally {
      setLoading(false);
    }
  }, [scope, myResourceId, t]);

  useEffect(() => { load(); }, [load]);

  const complete = async (item: MyWorkItem) => {
    try {
      await todosApi.completeMyWork(item.sourceType, item.id);
      toast.success(t('todos:toast.completed', { title: item.title }));
      load();
    } catch {
      toast.error(t('todos:error.complete'));
    }
  };

  const handleCreate = async (data: Partial<TodoItem>) => {
    try {
      await todosApi.create(data);
      setShowForm(false);
      toast.success(t('todos:toast.created'));
      load();
    } catch { toast.error(t('todos:error.create')); }
  };

  const handleUpdate = async (data: Partial<TodoItem>) => {
    if (!editing) return;
    try {
      // 폼이 안 건드리는 필드(status·assignee·sortOrder·completedDate)는 기존 값 유지 — 전체 페이로드로 전송.
      await todosApi.update(editing.id, { ...editing, ...data, updatedAt: editing.updatedAt });
      setEditing(null);
      load();
    } catch { toast.error(t('todos:error.update')); }
  };

  const openEditTodo = async (id: number) => {
    try {
      const full = await todosApi.get(id);
      setEditing(full);
    } catch { toast.error(t('todos:error.load')); }
  };

  const deleteTodo = async (id: number, title: string) => {
    if (!await confirmDialog({
      title: t('todos:delete.title'),
      message: t('todos:delete.message', { title }),
      confirmLabel: t('common:delete'),
      danger: true,
    })) return;
    try { await todosApi.delete(id); load(); }
    catch { toast.error(t('todos:error.delete')); }
  };

  const goToSource = (item: MyWorkItem) => {
    if (item.sourceType === 'wbs' && item.projectId != null)
      navigate(`/projects/${item.projectId}/wbs?highlight=${item.id}`);
    else if (item.sourceType === 'issue' && item.projectId != null)
      navigate(`/projects/${item.projectId}/issues?highlight=${item.id}`);
  };

  const todayStr = todayIso();
  const counts = useMemo(() => ({
    total: items.length,
    overdue: items.filter((i) => i.dueDate && i.dueDate.slice(0, 10) < todayStr).length,
  }), [items, todayStr]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h-page flex items-center gap-2">
          <SquareCheck size={18} className="text-muted" />
          {t('todos:title')}
        </h1>
        <Button variant="primary" onClick={() => { setEditing(null); setShowForm(true); }} leadingIcon={<Plus size={16} />}>
          {t('todos:newBtn')}
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-danger-soft border border-default rounded-md text-on-danger text-sm">{error}</div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <FilterBar>
          <Button
            variant={scope === 'mine' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setScope('mine')}
            disabled={myResourceId == null}
            title={myResourceId == null ? t('todos:scope.noIdentity') : undefined}
          >
            {t('todos:scope.mine')}
          </Button>
          <Button variant={scope === 'all' ? 'primary' : 'secondary'} size="sm" onClick={() => setScope('all')}>
            {t('todos:scope.all')}
          </Button>
        </FilterBar>
        <p className="text-xs text-muted">
          {t('todos:summary', { total: counts.total, overdue: counts.overdue })}
        </p>
      </div>

      {myResourceId == null && (
        <div className="p-3 bg-surface-2 border border-default rounded-md text-xs text-muted">
          {t('todos:noIdentityHint')}
        </div>
      )}

      {loading ? (
        <div className="py-10 flex justify-center"><Spinner label={t('common:loading')} /></div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<SquareCheck size={36} />}
          title={t('todos:empty.title')}
          description={t('todos:empty.desc')}
        />
      ) : (
        <div className="space-y-5">
          {groupMyWork(items, todayStr).map((g) => (
            <section key={g.key}>
              <div className="flex items-center gap-2 px-1 mb-1.5">
                <span className={`text-xs font-semibold ${groupTone[g.key]}`}>{t(`todos:group.${g.key}`)}</span>
                <span className="text-xs text-muted">{g.items.length}</span>
              </div>
              <div className="space-y-2">
                {g.items.map((item) => {
                  const meta = sourceMeta(item.sourceType);
                  const statusBadge = item.sourceType === 'wbs'
                    ? wbsStatusBadge[item.status as WbsStatus]
                    : item.sourceType === 'issue'
                      ? issueStatusBadge[item.status as IssueStatus]
                      : null;
                  // 중요도/우선순위 — 이슈=우선순위, 작업=중요도(함수), TODO=없음.
                  const rankBadge = item.sourceType === 'issue' && item.priority
                    ? issuePriorityBadge[item.priority as IssuePriority]
                    : item.sourceType === 'wbs' && item.importance != null
                      ? wbsImportanceBadge(item.importance)
                      : null;
                  const due = dueDisplay(item.dueDate, todayStr);
                  const dueLabel = due == null ? null
                    : due.kind === 'overdue' ? t('todos:due.overdueDays', { count: -due.days })
                    : due.kind === 'today' ? t('todos:due.today')
                    : due.days === 1 ? t('todos:due.tomorrow')
                    : formatDateShort(item.dueDate!);
                  const projectLabel = item.projectName ?? t('todos:personal');
                  return (
                    <Card key={`${item.sourceType}-${item.id}`} padding="tight" variant="subtle" className="group hover:border-strong transition-colors">
                      <div className="flex items-center gap-2">
                        {/* 완료 체크박스 — 모든 소스 complete() (작업=Done · 이슈=Resolved · TODO=완료) */}
                        <button
                          onClick={() => complete(item)}
                          aria-label={t('todos:completeBtn')}
                          className="shrink-0 text-muted hover:text-success transition-colors"
                        >
                          <Circle size={18} className="group-hover:hidden" />
                          <CheckCircle2 size={18} className="hidden group-hover:block" />
                        </button>

                        {/* 프로젝트 고정칸 (~5글자, 말줄임, 전체명 tooltip) — 소스배지 왼쪽 */}
                        <span className="w-16 shrink-0 truncate text-xs text-muted" title={projectLabel}>{projectLabel}</span>

                        {/* 소스 배지 */}
                        <Badge variant={meta.variant} size="sm" className="shrink-0 inline-flex items-center gap-1">
                          {meta.icon}{t(`todos:source.${meta.key}`)}
                        </Badge>

                        {/* 상태 · 중요도/우선순위 — 소스배지 오른쪽 */}
                        {statusBadge && <Badge variant={statusBadge.variant} size="sm" className="shrink-0">{t(statusBadge.labelKey)}</Badge>}
                        {rankBadge && <Badge variant={rankBadge.variant} size="sm" className="shrink-0">{t(rankBadge.labelKey)}</Badge>}

                        {/* 제목 (flex-1, 말줄임, 클릭=소스이동/ TODO 편집) */}
                        <span
                          className="flex-1 min-w-0 truncate text-sm font-medium text-primary cursor-pointer hover:text-accent"
                          onClick={() => (item.sourceType === 'todo' ? openEditTodo(item.id) : goToSource(item))}
                          title={item.title}
                        >
                          {item.title}
                        </span>

                        {/* 반복 (TODO) */}
                        {item.recurrence && item.recurrence !== 'None' && (
                          <Badge variant="neutral" size="sm" className="shrink-0 inline-flex items-center gap-1">
                            <Repeat size={10} />{t(`todos:recurrence.${item.recurrence}`)}
                          </Badge>
                        )}

                        {/* 기한 ⇄ 액션 — 고정폭 우측 칸. 평소 날짜, TODO 호버 시 같은 칸에서 편집/삭제로 교체 */}
                        <div className="w-24 shrink-0 flex items-center justify-end">
                          {item.sourceType === 'todo' ? (
                            <>
                              {due && <span className={`text-xs font-medium whitespace-nowrap group-hover:hidden ${dueToneClass[due.tone]}`}>{dueLabel}</span>}
                              <div className="hidden group-hover:flex items-center gap-1">
                                <button onClick={() => openEditTodo(item.id)} title={t('common:edit')} className="p-1 text-muted hover:text-primary transition-colors">
                                  <Save size={14} />
                                </button>
                                <button onClick={() => deleteTodo(item.id, item.title)} title={t('common:delete')} className="p-1 text-on-danger hover:opacity-80 transition-opacity">
                                  <X size={14} />
                                </button>
                              </div>
                            </>
                          ) : (
                            due && <span className={`text-xs font-medium whitespace-nowrap ${dueToneClass[due.tone]}`}>{dueLabel}</span>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {showForm && <TodoForm defaultAssignee={myResourceId} onSave={handleCreate} onCancel={() => setShowForm(false)} />}
      {editing && <TodoForm initial={editing} defaultAssignee={myResourceId} onSave={handleUpdate} onCancel={() => setEditing(null)} />}
    </div>
  );
}
