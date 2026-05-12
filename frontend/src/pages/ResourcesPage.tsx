import { useEffect, useState } from 'react';
import { Plus, Pencil, X, Save, Users, User, Wrench, Mail, Phone, Building } from 'lucide-react';
import { resourcesApi } from '../api/resources';
import type { Resource, ResourceType, ResourceAssignment } from '../types';

const wbsStatusLabel = { Planned: '예정', InProgress: '진행', Done: '완료' };

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

  const inputClass =
    'w-full bg-zinc-800/60 border border-zinc-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-zinc-500';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#1f1f1f] rounded-lg p-6 w-full max-w-lg border border-[#2a2a2a] my-4 space-y-3">
        <h2 className="text-base font-medium text-slate-100 mb-2">
          {initial?.id ? '리소스 수정' : '리소스 등록'}
        </h2>

        <div>
          <label className="block text-xs text-slate-400 mb-1">이름 *</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">타입</label>
          <div className="flex gap-2">
            {(['Person', 'Equipment'] as ResourceType[]).map((t) => (
              <button
                key={t}
                onClick={() => set('type', t)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  form.type === t ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-slate-300 hover:bg-zinc-700'
                }`}
              >
                {t === 'Person' ? <User size={14} /> : <Wrench size={14} />}
                {t === 'Person' ? '인원' : '장비'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">부서 / 그룹</label>
          <input value={form.department} onChange={(e) => set('department', e.target.value)} className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">이메일</label>
            <input value={form.email} onChange={(e) => set('email', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">연락처</label>
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} />
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">비고</label>
          <textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div className="flex gap-2 justify-end pt-3 border-t border-[#2a2a2a]">
          <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-zinc-800 hover:bg-zinc-700 text-slate-200 transition-colors">
            <X size={14} /> 취소
          </button>
          <button
            onClick={() => onSave(form)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            <Save size={14} /> 저장
          </button>
        </div>
      </div>
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#1f1f1f] rounded-lg p-6 w-full max-w-2xl border border-[#2a2a2a] my-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-medium text-slate-100">
            {resource.name} - 할당된 작업
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 py-6 text-center">불러오는 중...</p>
        ) : error ? (
          <p className="text-sm text-red-400 py-6 text-center">{error}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">할당된 작업이 없습니다.</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {items.map((a) => (
              <div key={a.wbsItemId} className="bg-zinc-800/40 border border-zinc-700 rounded-md p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400 mb-1">{a.projectName}</p>
                    <p className="text-sm text-slate-100 font-medium">{a.wbsItemName}</p>
                    <div className="flex gap-3 mt-1 text-xs text-slate-400">
                      <span>{a.startDate?.slice(0, 10) ?? '-'} ~ {a.endDate?.slice(0, 10) ?? '-'}</span>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                    a.status === 'InProgress' ? 'bg-amber-500/15 text-amber-300'
                    : a.status === 'Done' ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-zinc-700/50 text-slate-300'
                  }`}>
                    {wbsStatusLabel[a.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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

  const filterBtn = (active: boolean) =>
    `px-3 py-1.5 rounded-md text-sm transition-colors ${
      active ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-slate-300 hover:bg-zinc-700'
    }`;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <Users size={18} className="text-slate-400" />
          리소스 관리
        </h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-medium transition-colors"
        >
          <Plus size={14} /> 리소스 등록
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-900/40 border border-red-700/50 rounded-md text-red-300 text-sm">{error}</div>
      )}

      <div className="flex gap-2">
        <button onClick={() => setFilter('All')} className={filterBtn(filter === 'All')}>전체</button>
        <button onClick={() => setFilter('Person')} className={filterBtn(filter === 'Person')}>
          <span className="flex items-center gap-1.5"><User size={14} /> 인원</span>
        </button>
        <button onClick={() => setFilter('Equipment')} className={filterBtn(filter === 'Equipment')}>
          <span className="flex items-center gap-1.5"><Wrench size={14} /> 장비</span>
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Users size={36} className="mx-auto mb-2 text-slate-600" />
          <p className="text-sm">등록된 리소스가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <div
              key={r.id}
              onClick={() => setViewing(r)}
              className="bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg p-4 cursor-pointer hover:border-zinc-500 transition-colors group"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {r.type === 'Person'
                    ? <User size={16} className="text-zinc-300" />
                    : <Wrench size={16} className="text-amber-300" />}
                  <h3 className="font-medium text-slate-100">{r.name}</h3>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setEditing(r)} className="p-1 text-slate-400 hover:text-slate-200">
                    <Pencil size={14} />
                  </button>
                  <button onClick={(e) => handleDelete(r.id, e)} className="p-1 text-red-400 hover:text-red-300">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="space-y-1 text-xs text-slate-400">
                {r.department && (
                  <p className="flex items-center gap-1.5"><Building size={11} /> {r.department}</p>
                )}
                {r.email && (
                  <p className="flex items-center gap-1.5 truncate"><Mail size={11} /> {r.email}</p>
                )}
                {r.phone && (
                  <p className="flex items-center gap-1.5"><Phone size={11} /> {r.phone}</p>
                )}
              </div>
              {r.notes && <p className="text-xs text-slate-500 mt-2 line-clamp-2">{r.notes}</p>}
              <p className="text-xs text-zinc-400 mt-3 pt-2 border-t border-[#2a2a2a]">
                클릭하여 할당된 작업 보기
              </p>
            </div>
          ))}
        </div>
      )}

      {showForm && <ResourceForm onSave={handleCreate} onCancel={() => setShowForm(false)} />}
      {editing && <ResourceForm initial={editing} onSave={handleUpdate} onCancel={() => setEditing(null)} />}
      {viewing && <AssignmentsModal resource={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
