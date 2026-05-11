import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, X, Save, Download, FolderOpen, Calendar, Users } from 'lucide-react';
import { projectsApi } from '../api/projects';
import { useProjectStore } from '../store/useProjectStore';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge';
import type { Project, ProjectStatus } from '../types';

const statusOptions: { value: ProjectStatus; label: string }[] = [
  { value: 'Planned', label: '계획' },
  { value: 'Waiting', label: '대기' },
  { value: 'InProgress', label: '진행' },
  { value: 'Done', label: '완료' },
];

function ProjectForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Project>;
  onSave: (data: Omit<Project, 'id' | 'folderPath' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    goal: initial?.goal ?? '',
    status: (initial?.status ?? 'Planned') as ProjectStatus,
    startDate: initial?.startDate?.slice(0, 10) ?? '',
    endDate: initial?.endDate?.slice(0, 10) ?? '',
    budget: initial?.budget?.toString() ?? '',
    participants: initial?.participants ?? '',
    deliverables: initial?.deliverables ?? '',
    relatedLinks: initial?.relatedLinks ?? '',
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    onSave({
      ...form,
      budget: form.budget ? parseFloat(form.budget) : undefined,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
    } as any);
  };

  const inputClass =
    'w-full bg-zinc-800/60 border border-zinc-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-zinc-500';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#1f1f1f] rounded-lg p-6 w-full max-w-3xl border border-[#2a2a2a] my-4">
        <h2 className="text-base font-medium text-slate-100 mb-5">
          {initial?.id ? '프로젝트 수정' : '새 프로젝트'}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 좌측 - 기본 정보 */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">프로젝트명 *</label>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">상태</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputClass}>
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">시작일</label>
                <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">종료일</label>
                <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className={inputClass} />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">예산</label>
              <input type="number" value={form.budget} onChange={(e) => set('budget', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">참여 인원</label>
              <input value={form.participants} onChange={(e) => set('participants', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">주요 산출물</label>
              <input value={form.deliverables} onChange={(e) => set('deliverables', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">관련 링크</label>
              <input value={form.relatedLinks} onChange={(e) => set('relatedLinks', e.target.value)} className={inputClass} />
            </div>
          </div>

          {/* 우측 - 긴 텍스트 */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">목표</label>
              <textarea
                value={form.goal}
                onChange={(e) => set('goal', e.target.value)}
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">설명</label>
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                rows={12}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-5 mt-5 border-t border-[#2a2a2a]">
          <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-zinc-800 hover:bg-zinc-700 text-slate-200 transition-colors">
            <X size={14} /> 취소
          </button>
          <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-zinc-700 hover:bg-zinc-600 text-white transition-colors">
            <Save size={14} /> 저장
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectList() {
  const navigate = useNavigate();
  const { projects, setProjects, selectProject, addProject, updateProject, removeProject } = useProjectStore();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    projectsApi.getAll().then(setProjects).catch(() => setError('프로젝트 목록을 불러올 수 없습니다.'));
  }, [setProjects]);

  const handleCreate = async (data: any) => {
    try {
      const p = await projectsApi.create(data);
      addProject(p);
      setShowForm(false);
    } catch { setError('프로젝트 생성 실패'); }
  };

  const handleUpdate = async (data: any) => {
    if (!editing) return;
    try {
      const p = await projectsApi.update(editing.id, data);
      updateProject(p);
      setEditing(null);
    } catch { setError('프로젝트 수정 실패'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('프로젝트를 삭제하시겠습니까?')) return;
    try {
      await projectsApi.delete(id);
      removeProject(id);
    } catch { setError('프로젝트 삭제 실패'); }
  };

  const handleBackup = async (project: Project) => {
    try {
      await projectsApi.backup(project.id, project.name);
    } catch { setError('백업 실패'); }
  };

  const openProject = (id: number) => {
    selectProject(id);
    navigate(`/projects/${id}/dashboard`);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-slate-100">프로젝트 목록</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-md text-sm font-medium transition-colors"
        >
          <Plus size={14} /> 새 프로젝트
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/40 border border-red-700/50 rounded-md text-red-300 text-sm">{error}</div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <FolderOpen size={40} className="mx-auto mb-3 text-slate-600" />
          <p className="text-sm">프로젝트가 없습니다. 새 프로젝트를 만들어보세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p) => {
            const daysLeft = p.endDate
              ? Math.ceil((new Date(p.endDate).getTime() - Date.now()) / 86400000)
              : null;
            // 모든 상태에 대해 endDate가 있으면 남은 일수 표시
            const showDaysLeft = daysLeft !== null && p.status !== 'Done';

            return (
              <div
                key={p.id}
                className="bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg p-5 hover:border-zinc-500 transition-colors cursor-pointer group"
                onClick={() => openProject(p.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-slate-100 group-hover:text-zinc-300 transition-colors">{p.name}</h3>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => handleBackup(p)} title="백업" className="p-1 text-slate-400 hover:text-slate-200 rounded">
                      <Download size={14} />
                    </button>
                    <button onClick={() => setEditing(p)} title="수정" className="p-1 text-slate-400 hover:text-slate-200 rounded">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(p.id)} title="삭제" className="p-1 text-red-400 hover:text-red-300 rounded">
                      <X size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <ProjectStatusBadge status={p.status} />
                  {showDaysLeft && (
                    <span className={`text-xs ${daysLeft < 0 ? 'text-red-400' : daysLeft < 7 ? 'text-amber-400' : 'text-slate-400'}`}>
                      {daysLeft < 0 ? `${Math.abs(daysLeft)}일 초과` : `${daysLeft}일 남음`}
                    </span>
                  )}
                  {p.status === 'Done' && daysLeft !== null && (
                    <span className="text-xs text-emerald-400">완료</span>
                  )}
                </div>

                {p.goal && <p className="text-sm text-slate-300 line-clamp-2 mb-1">{p.goal}</p>}
                {p.description && <p className="text-sm text-slate-400 line-clamp-2 mb-3">{p.description}</p>}

                <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-3 pt-3 border-t border-[#2a2a2a]">
                  {(p.startDate || p.endDate) && (
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {p.startDate?.slice(0, 10) ?? '-'} ~ {p.endDate?.slice(0, 10) ?? '-'}
                    </span>
                  )}
                  {p.participants && (
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {p.participants}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && <ProjectForm onSave={handleCreate} onCancel={() => setShowForm(false)} />}
      {editing && <ProjectForm initial={editing} onSave={handleUpdate} onCancel={() => setEditing(null)} />}
    </div>
  );
}
