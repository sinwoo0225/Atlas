import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, X, Save, Users, User, Wrench, Mail, Phone, Building, ChevronDown, ChevronRight } from 'lucide-react';
import { resourcesApi } from '../api/resources';
import { Button, Card, Modal, Badge, EmptyState, FormField, Spinner, CopyButton, inputClass } from '../components/ui';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { wbsStatusBadge } from '../utils/statusMaps';
import { useGlobalShortcut } from '../hooks/useGlobalShortcut';
import type { Resource, ResourceType, ResourceAssignment } from '../types';

function ResourceForm({ initial, onSave, onCancel }: {
  initial?: Resource;
  onSave: (data: Omit<Resource, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}) {
  const initialForm = {
    name: initial?.name ?? '',
    type: (initial?.type ?? 'Person') as ResourceType,
    department: initial?.department ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    notes: initial?.notes ?? '',
  };
  const [form, setForm] = useState(initialForm);
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open
      onClose={onCancel}
      title={initial?.id ? '리소스 수정' : '리소스 등록'}
      size="md"
      dirty={dirty}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>취소</Button>
          <Button variant="primary" onClick={() => onSave(form)} leadingIcon={<Save size={16} />}>저장</Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="이름" required>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
        </FormField>

        <div>
          <label className="block text-xs text-muted font-medium mb-1">타입</label>
          <div className="flex gap-2">
            {(['Person', 'Equipment'] as ResourceType[]).map((t) => (
              <Button
                key={t}
                variant={form.type === t ? 'primary' : 'secondary'}
                size="md"
                onClick={() => set('type', t)}
                leadingIcon={t === 'Person' ? <User size={14} /> : <Wrench size={14} />}
              >
                {t === 'Person' ? '인원' : '장비'}
              </Button>
            ))}
          </div>
        </div>

        <FormField label="부서 / 그룹">
          <input value={form.department} onChange={(e) => set('department', e.target.value)} className={inputClass} />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="이메일">
            <div className="flex items-center gap-1.5">
              <input value={form.email} onChange={(e) => set('email', e.target.value)} className={inputClass} />
              <CopyButton value={form.email} title="이메일 복사" />
            </div>
          </FormField>
          <FormField label="연락처">
            <div className="flex items-center gap-1.5">
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} />
              <CopyButton value={form.phone} title="연락처 복사" />
            </div>
          </FormField>
        </div>

        <FormField label="비고">
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
        <Badge variant={status.variant} size="sm">{status.label}</Badge>
      </div>
    </Card>
  );
}

// 한 프로젝트의 할당 작업 그룹 — 진행/예정은 항상, 완료(Done)는 접힌 섹션으로(기본 접힘).
function AssignmentProjectGroup({ projectName, active, done }: {
  projectName: string; active: ResourceAssignment[]; done: ResourceAssignment[];
}) {
  const [showDone, setShowDone] = useState(false);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted font-medium">{projectName}</p>
      {active.map((a) => <AssignmentCard key={a.wbsItemId} a={a} />)}
      {active.length === 0 && (
        <p className="text-xs text-muted/70 pl-1">진행 중인 작업 없음</p>
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
            완료 {done.length}건
          </button>
          {showDone && done.map((a) => <AssignmentCard key={a.wbsItemId} a={a} />)}
        </>
      )}
    </div>
  );
}

function AssignmentsModal({ resource, onClose }: { resource: Resource; onClose: () => void }) {
  const [items, setItems] = useState<ResourceAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // 활성(진행 중 작업이 있는) 프로젝트만 보기 — 기본 ON. 프로젝트가 늘어도 완료만 남은 그룹은 숨겨 화면을 가볍게.
  const [activeOnly, setActiveOnly] = useState(true);

  useEffect(() => {
    resourcesApi.getAssignments(resource.id)
      .then(setItems)
      .catch(() => setError('할당 작업을 불러올 수 없습니다.'))
      .finally(() => setLoading(false));
  }, [resource.id]);

  // 프로젝트별 그룹 — 진행/예정(active) vs 완료(done) 분리. activeOnly 면 active 없는 그룹 제외.
  const groups = useMemo(() => {
    const byProject = new Map<number, { name: string; active: ResourceAssignment[]; done: ResourceAssignment[] }>();
    for (const a of items) {
      let g = byProject.get(a.projectId);
      if (!g) { g = { name: a.projectName, active: [], done: [] }; byProject.set(a.projectId, g); }
      (a.status === 'Done' ? g.done : g.active).push(a);
    }
    let list = [...byProject.values()];
    if (activeOnly) list = list.filter((g) => g.active.length > 0);
    return list.sort((x, y) => x.name.localeCompare(y.name, 'ko'));
  }, [items, activeOnly]);

  const hiddenCount = items.length === 0
    ? 0
    : items.filter((a) => a.status === 'Done').length; // 참고용(완료 총건수)

  return (
    <Modal
      open
      onClose={onClose}
      title={`${resource.name} — 할당된 작업`}
      size="lg"
      showCloseButton
    >
      {loading ? (
        <div className="py-6 flex justify-center"><Spinner label="불러오는 중..." /></div>
      ) : error ? (
        <p className="text-sm text-on-danger py-6 text-center">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted py-6 text-center">할당된 작업이 없습니다.</p>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="w-auto"
            />
            진행 중인 작업이 있는 프로젝트만 보기 (완료 {hiddenCount}건은 그룹별 ‘완료’ 섹션에서 펼치기)
          </label>
          {groups.length === 0 ? (
            <p className="text-sm text-muted py-6 text-center">진행 중인 작업이 없습니다. 체크를 해제하면 완료만 있는 프로젝트도 보입니다.</p>
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
  const [resources, setResources] = useState<Resource[]>([]);
  const [filter, setFilter] = useState<ResourceType | 'All'>('All');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [viewing, setViewing] = useState<Resource | null>(null);
  const [error, setError] = useState('');

  useGlobalShortcut('mod+n', () => { setEditing(null); setShowForm(true); });

  const load = () => resourcesApi.getAll().then(setResources).catch(() => setError('리소스 목록을 불러올 수 없습니다.'));

  useEffect(() => { load(); }, []);

  const handleCreate = async (data: Omit<Resource, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await resourcesApi.create(data);
      setShowForm(false);
      load();
      toast.success(data.name ? `새 리소스 '${data.name}' 이(가) 추가됐어요` : '새 리소스가 추가됐어요');
    } catch { setError('리소스 등록 실패'); }
  };

  const handleUpdate = async (data: Omit<Resource, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!editing) return;
    try {
      await resourcesApi.update(editing.id, data);
      setEditing(null);
      load();
    } catch { setError('리소스 수정 실패'); }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!await confirmDialog({
      title: '리소스 삭제',
      message: '이 리소스를 삭제하시겠습니까? 되돌릴 수 없습니다.',
      confirmLabel: '삭제',
      danger: true,
    })) return;
    try {
      await resourcesApi.delete(id);
      load();
    } catch { setError('리소스 삭제 실패'); }
  };

  const filtered = filter === 'All' ? resources : resources.filter((r) => r.type === filter);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h-page flex items-center gap-2">
          <Users size={18} className="text-muted" />
          리소스 관리
        </h1>
        <Button variant="primary" onClick={() => setShowForm(true)} leadingIcon={<Plus size={16} />}>
          리소스 등록
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-danger-soft border border-default rounded-md text-on-danger text-sm">{error}</div>
      )}

      <div className="flex gap-2 flex-wrap">
        <Button variant={filter === 'All' ? 'primary' : 'secondary'} size="sm" onClick={() => setFilter('All')}>전체</Button>
        <Button
          variant={filter === 'Person' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setFilter('Person')}
          leadingIcon={<User size={14} />}
        >
          인원
        </Button>
        <Button
          variant={filter === 'Equipment' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setFilter('Equipment')}
          leadingIcon={<Wrench size={14} />}
        >
          장비
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={36} />}
          title="등록된 리소스가 없습니다."
          description={filter === 'All' ? '우측 상단 \'리소스 등록\' 버튼으로 시작해보세요.' : '해당 타입의 리소스가 없습니다.'}
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
                  <button onClick={() => setEditing(r)} title="수정" aria-label="수정" className="p-1 text-muted hover:text-primary transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={(e) => handleDelete(r.id, e)} title="삭제" aria-label="삭제" className="p-1 text-on-danger hover:opacity-80 transition-opacity">
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
                      <CopyButton value={r.email} title="이메일 복사" className="!p-1" />
                    </span>
                  </p>
                )}
                {r.phone && (
                  <p className="flex items-center gap-1.5">
                    <Phone size={12} className="shrink-0" />
                    <span className="truncate">{r.phone}</span>
                    <span onClick={(e) => e.stopPropagation()} className="ml-auto">
                      <CopyButton value={r.phone} title="연락처 복사" className="!p-1" />
                    </span>
                  </p>
                )}
              </div>
              {r.notes && <p className="text-xs text-muted mt-2 line-clamp-2">{r.notes}</p>}
              <p className="text-xs text-muted mt-3 pt-2 border-t border-default">
                클릭하여 할당된 작업 보기
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
