import { useEffect, useState } from 'react';
import { Plus, Pencil, X, Save, Users, User, Wrench, Mail, Phone, Building } from 'lucide-react';
import { resourcesApi } from '../api/resources';
import { Button, Card, Badge, EmptyState, FormField, Spinner, inputClass } from '../components/ui';
import { wbsStatusBadge } from '../utils/statusMaps';
import type { Resource, ResourceType, ResourceAssignment } from '../types';

function ResourceForm({ initial, onSave, onCancel }: {
  initial?: Resource;
  onSave: (data: Omit<Resource, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    type: (initial?.type ?? 'Person') as ResourceType,
    department: initial?.department ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    notes: initial?.notes ?? '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card padding="spacious" className="w-full max-w-lg my-4 space-y-3">
        <h2 className="h-section mb-2">
          {initial?.id ? '리소스 수정' : '리소스 등록'}
        </h2>

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
            <input value={form.email} onChange={(e) => set('email', e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="연락처">
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} />
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

        <div className="flex gap-2 justify-end pt-3 border-t border-default">
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>취소</Button>
          <Button variant="primary" onClick={() => onSave(form)} leadingIcon={<Save size={16} />}>저장</Button>
        </div>
      </Card>
    </div>
  );
}

function AssignmentsModal({ resource, onClose }: { resource: Resource; onClose: () => void }) {
  const [items, setItems] = useState<ResourceAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    resourcesApi.getAssignments(resource.id)
      .then(setItems)
      .catch(() => setError('할당 작업을 불러올 수 없습니다.'))
      .finally(() => setLoading(false));
  }, [resource.id]);

  return (
    <div className="modal-overlay fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card padding="spacious" className="w-full max-w-2xl my-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="h-section">
            {resource.name} — 할당된 작업
          </h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-primary transition-colors">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="py-6 flex justify-center"><Spinner label="불러오는 중..." /></div>
        ) : error ? (
          <p className="text-sm text-on-danger py-6 text-center">{error}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted py-6 text-center">할당된 작업이 없습니다.</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {items.map((a) => {
              const status = wbsStatusBadge[a.status];
              return (
                <Card key={a.wbsItemId} padding="tight" variant="subtle">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted mb-1">{a.projectName}</p>
                      <p className="text-sm text-primary font-medium">{a.wbsItemName}</p>
                      <div className="flex gap-3 mt-1 text-xs text-muted">
                        <span>{a.startDate?.slice(0, 10) ?? '-'} ~ {a.endDate?.slice(0, 10) ?? '-'}</span>
                      </div>
                    </div>
                    <Badge variant={status.variant} size="sm">{status.label}</Badge>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

export function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [filter, setFilter] = useState<ResourceType | 'All'>('All');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [viewing, setViewing] = useState<Resource | null>(null);
  const [error, setError] = useState('');

  const load = () => resourcesApi.getAll().then(setResources).catch(() => setError('리소스 목록을 불러올 수 없습니다.'));

  useEffect(() => { load(); }, []);

  const handleCreate = async (data: Omit<Resource, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await resourcesApi.create(data);
      setShowForm(false);
      load();
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
    if (!confirm('이 리소스를 삭제하시겠습니까?')) return;
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
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setEditing(r)} className="p-1 text-muted hover:text-primary transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={(e) => handleDelete(r.id, e)} className="p-1 text-on-danger hover:opacity-80 transition-opacity">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="space-y-1 text-xs text-muted">
                {r.department && (
                  <p className="flex items-center gap-1.5"><Building size={12} /> {r.department}</p>
                )}
                {r.email && (
                  <p className="flex items-center gap-1.5 truncate"><Mail size={12} /> {r.email}</p>
                )}
                {r.phone && (
                  <p className="flex items-center gap-1.5"><Phone size={12} /> {r.phone}</p>
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
