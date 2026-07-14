import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, X, Save, Users, User, Wrench, Mail, Phone, Building, ChevronDown, ChevronRight } from 'lucide-react';
import { resourcesApi } from '../api/resources';
import { Button, Card, Modal, Badge, EmptyState, FilterBar, FormField, Spinner, CopyButton, inputClass } from '../components/ui';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { wbsStatusBadge } from '../utils/statusMaps';
import { isClosedWbs } from '../utils/wbsHelpers';
import { useCreateForm } from '../hooks/useCreateForm';
import type { Resource, ResourceType, ResourceAssignment } from '../types';

function ResourceForm({ initial, onSave, onCancel }: {
  initial?: Resource;
  onSave: (data: Omit<Resource, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const initialForm = {
    name: initial?.name ?? '',
    type: (initial?.type ?? 'Person') as ResourceType,
    department: initial?.department ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    notes: initial?.notes ?? '',
    weeklyCapacityHours: initial?.weeklyCapacityHours ?? 40,
    costRate: initial?.costRate ?? null,
    billRate: initial?.billRate ?? null,
    skills: initial?.skills ?? '',
    isActive: initial?.isActive ?? true,
  };
  const [form, setForm] = useState(initialForm);
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setField = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open
      onClose={onCancel}
      title={initial?.id ? t('resources:form.editTitle') : t('resources:form.newTitle')}
      size="md"
      dirty={dirty}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>{t('common:cancel')}</Button>
          <Button variant="primary" onClick={() => onSave(form)} leadingIcon={<Save size={16} />}>{t('common:save')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label={t('resources:form.name')} required>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
        </FormField>

        <div>
          <label className="block text-xs text-muted font-medium mb-1">{t('resources:form.type')}</label>
          <div className="flex gap-2">
            {(['Person', 'Equipment'] as ResourceType[]).map((rt) => (
              <Button
                key={rt}
                variant={form.type === rt ? 'primary' : 'secondary'}
                size="md"
                onClick={() => set('type', rt)}
                leadingIcon={rt === 'Person' ? <User size={14} /> : <Wrench size={14} />}
              >
                {rt === 'Person' ? t('resources:form.person') : t('resources:form.equipment')}
              </Button>
            ))}
          </div>
        </div>

        <FormField label={t('resources:form.department')}>
          <input value={form.department} onChange={(e) => set('department', e.target.value)} className={inputClass} />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('resources:form.email')}>
            <div className="flex items-center gap-1.5">
              <input value={form.email} onChange={(e) => set('email', e.target.value)} className={inputClass} />
              <CopyButton value={form.email} title={t('resources:form.copyEmail')} />
            </div>
          </FormField>
          <FormField label={t('resources:form.phone')}>
            <div className="flex items-center gap-1.5">
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} />
              <CopyButton value={form.phone} title={t('resources:form.copyPhone')} />
            </div>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('resources:form.weeklyCapacity')}>
            <input
              type="number" min={0} step={1}
              value={form.weeklyCapacityHours}
              onChange={(e) => setField('weeklyCapacityHours', e.target.value === '' ? 0 : Number(e.target.value))}
              className={inputClass}
            />
          </FormField>
          <FormField label={t('resources:form.skills')}>
            <input value={form.skills} onChange={(e) => set('skills', e.target.value)} className={inputClass} placeholder={t('resources:form.skillsPlaceholder')} />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('resources:form.costRate')}>
            <input
              type="number" min={0} step={1}
              value={form.costRate ?? ''}
              onChange={(e) => setField('costRate', e.target.value === '' ? null : Number(e.target.value))}
              className={inputClass}
            />
          </FormField>
          <FormField label={t('resources:form.billRate')}>
            <input
              type="number" min={0} step={1}
              value={form.billRate ?? ''}
              onChange={(e) => setField('billRate', e.target.value === '' ? null : Number(e.target.value))}
              className={inputClass}
            />
          </FormField>
        </div>

        <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setField('isActive', e.target.checked)} />
          {t('resources:form.active')}
          <span className="text-xs text-muted">{t('resources:form.activeHint')}</span>
        </label>

        <FormField label={t('resources:form.notes')}>
          <textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </FormField>
      </div>
    </Modal>
  );
}

function AssignmentCard({ a }: { a: ResourceAssignment }) {
  const { t } = useTranslation();
  const status = wbsStatusBadge[a.status];
  return (
    <Card padding="tight" variant="subtle">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-primary font-medium">{a.wbsItemName}</p>
          <div className="flex gap-3 mt-1 text-xs text-muted">
            <span>{a.startDate?.slice(0, 10) ?? '-'} ~ {a.endDate?.slice(0, 10) ?? '-'}</span>
          </div>
        </div>
        <Badge variant={status.variant} size="sm">{t(status.labelKey)}</Badge>
      </div>
    </Card>
  );
}

// 한 프로젝트의 할당 작업 그룹 — 진행/예정은 항상, 완료(Done)는 접힌 섹션으로(기본 접힘).
function AssignmentProjectGroup({ projectName, active, done }: {
  projectName: string; active: ResourceAssignment[]; done: ResourceAssignment[];
}) {
  const { t } = useTranslation();
  const [showDone, setShowDone] = useState(false);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted font-medium">{projectName}</p>
      {active.map((a) => <AssignmentCard key={a.wbsItemId} a={a} />)}
      {active.length === 0 && (
        <p className="text-xs text-muted/70 pl-1">{t('resources:assign.noActive')}</p>
      )}
      {done.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors"
            aria-expanded={showDone}
          >
            {showDone ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {t('resources:assign.doneCount', { count: done.length })}
          </button>
          {showDone && done.map((a) => <AssignmentCard key={a.wbsItemId} a={a} />)}
        </>
      )}
    </div>
  );
}

function AssignmentsModal({ resource, onClose }: { resource: Resource; onClose: () => void }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ResourceAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // 활성(진행 중 작업이 있는) 프로젝트만 보기 — 기본 ON. 프로젝트가 늘어도 완료만 남은 그룹은 숨겨 화면을 가볍게.
  const [activeOnly, setActiveOnly] = useState(true);

  useEffect(() => {
    resourcesApi.getAssignments(resource.id)
      .then(setItems)
      .catch(() => setError(t('resources:assign.loadError')))
      .finally(() => setLoading(false));
  }, [resource.id, t]);

  // 프로젝트별 그룹 — 진행/예정(active) vs 종료(done) 분리. activeOnly 면 active 없는 그룹 제외.
  // 종료 = 완료(Done) + 중단(Suspended). 중단을 active 로 두면 이 사람이 아직 붙들고 있는 일처럼 보인다.
  const groups = useMemo(() => {
    const byProject = new Map<number, { name: string; active: ResourceAssignment[]; done: ResourceAssignment[] }>();
    for (const a of items) {
      let g = byProject.get(a.projectId);
      if (!g) { g = { name: a.projectName, active: [], done: [] }; byProject.set(a.projectId, g); }
      (isClosedWbs(a.status) ? g.done : g.active).push(a);
    }
    let list = [...byProject.values()];
    if (activeOnly) list = list.filter((g) => g.active.length > 0);
    return list.sort((x, y) => x.name.localeCompare(y.name, 'ko'));
  }, [items, activeOnly]);

  const hiddenCount = items.length === 0
    ? 0
    : items.filter((a) => isClosedWbs(a.status)).length; // 참고용(종료 총건수)

  return (
    <Modal
      open
      onClose={onClose}
      title={t('resources:assign.modalTitle', { name: resource.name })}
      size="lg"
      showCloseButton
    >
      {loading ? (
        <div className="py-6 flex justify-center"><Spinner label={t('common:loading')} /></div>
      ) : error ? (
        <p className="text-sm text-on-danger py-6 text-center">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted py-6 text-center">{t('resources:assign.noAssignments')}</p>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="w-auto"
            />
            {t('resources:assign.activeOnlyLabel', { count: hiddenCount })}
          </label>
          {groups.length === 0 ? (
            <p className="text-sm text-muted py-6 text-center">{t('resources:assign.noActiveGroups')}</p>
          ) : (
            <div className="space-y-4 max-h-[55vh] overflow-y-auto">
              {groups.map((g) => (
                <AssignmentProjectGroup key={g.name} projectName={g.name} active={g.active} done={g.done} />
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function ResourcesPage() {
  const { t } = useTranslation();
  const [resources, setResources] = useState<Resource[]>([]);
  const [filter, setFilter] = useState<ResourceType | 'All'>('All');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [viewing, setViewing] = useState<Resource | null>(null);
  const [error, setError] = useState('');

  useCreateForm(() => { setEditing(null); setShowForm(true); });

  const load = useCallback(() => resourcesApi.getAll().then(setResources).catch(() => setError(t('resources:error.loadList'))), [t]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data: Omit<Resource, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await resourcesApi.create(data);
      setShowForm(false);
      load();
      toast.success(data.name ? t('resources:toast.created', { name: data.name }) : t('resources:toast.createdNoName'));
    } catch { setError(t('resources:error.createFailed')); }
  };

  const handleUpdate = async (data: Omit<Resource, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!editing) return;
    try {
      await resourcesApi.update(editing.id, data);
      setEditing(null);
      load();
    } catch { setError(t('resources:error.updateFailed')); }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!await confirmDialog({
      title: t('resources:delete.title'),
      message: t('resources:delete.message'),
      confirmLabel: t('common:delete'),
      danger: true,
    })) return;
    try {
      await resourcesApi.delete(id);
      load();
    } catch { setError(t('resources:error.deleteFailed')); }
  };

  const filtered = filter === 'All' ? resources : resources.filter((r) => r.type === filter);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h-page flex items-center gap-2">
          <Users size={18} className="text-muted" />
          {t('resources:title')}
        </h1>
        <Button variant="primary" onClick={() => setShowForm(true)} leadingIcon={<Plus size={16} />}>
          {t('resources:newBtn')}
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-danger-soft border border-default rounded-md text-on-danger text-sm">{error}</div>
      )}

      <FilterBar>
        <Button variant={filter === 'All' ? 'primary' : 'secondary'} size="sm" onClick={() => setFilter('All')}>{t('resources:filterAll')}</Button>
        <Button
          variant={filter === 'Person' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setFilter('Person')}
          leadingIcon={<User size={14} />}
        >
          {t('resources:form.person')}
        </Button>
        <Button
          variant={filter === 'Equipment' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setFilter('Equipment')}
          leadingIcon={<Wrench size={14} />}
        >
          {t('resources:form.equipment')}
        </Button>
      </FilterBar>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={36} />}
          title={t('resources:empty.title')}
          description={filter === 'All' ? t('resources:empty.descAll') : t('resources:empty.descFiltered')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <Card
              key={r.id}
              padding="normal"
              onClick={() => setViewing(r)}
              className="cursor-pointer hover:border-strong transition-colors group"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {r.type === 'Person'
                    ? <User size={16} className="text-accent" />
                    : <Wrench size={16} className="text-on-warning" />}
                  <h3 className="font-medium text-primary">{r.name}</h3>
                </div>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setEditing(r)} title={t('common:edit')} aria-label={t('common:edit')} className="p-1 text-muted hover:text-primary transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={(e) => handleDelete(r.id, e)} title={t('common:delete')} aria-label={t('common:delete')} className="p-1 text-on-danger hover:opacity-80 transition-opacity">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="space-y-1 text-xs text-muted">
                {r.department && (
                  <p className="flex items-center gap-1.5"><Building size={12} /> {r.department}</p>
                )}
                {r.email && (
                  <p className="flex items-center gap-1.5">
                    <Mail size={12} className="shrink-0" />
                    <span className="truncate">{r.email}</span>
                    <span onClick={(e) => e.stopPropagation()} className="ml-auto">
                      <CopyButton value={r.email} title={t('resources:form.copyEmail')} className="!p-1" />
                    </span>
                  </p>
                )}
                {r.phone && (
                  <p className="flex items-center gap-1.5">
                    <Phone size={12} className="shrink-0" />
                    <span className="truncate">{r.phone}</span>
                    <span onClick={(e) => e.stopPropagation()} className="ml-auto">
                      <CopyButton value={r.phone} title={t('resources:form.copyPhone')} className="!p-1" />
                    </span>
                  </p>
                )}
              </div>
              {r.notes && <p className="text-xs text-muted mt-2 line-clamp-2">{r.notes}</p>}
              <p className="text-xs text-muted mt-3 pt-2 border-t border-default">
                {t('resources:card.viewAssignments')}
              </p>
            </Card>
          ))}
        </div>
      )}

      {showForm && <ResourceForm onSave={handleCreate} onCancel={() => setShowForm(false)} />}
      {editing && <ResourceForm initial={editing} onSave={handleUpdate} onCancel={() => setEditing(null)} />}
      {viewing && <AssignmentsModal resource={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
