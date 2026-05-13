import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, X, Save, Download, FolderOpen, Calendar, Users } from 'lucide-react';
import { projectsApi } from '../api/projects';
import { useProjectStore } from '../store/useProjectStore';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge';
import { Button, Card, Badge, EmptyState, FormField, inputClass } from '../components/ui';
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

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card padding="spacious" className="w-full max-w-3xl my-4">
        <h2 className="h-section mb-5">
          {initial?.id ? '프로젝트 수정' : '새 프로젝트'}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 좌측 - 기본 정보 */}
          <div className="space-y-3">
            <FormField label="프로젝트명" required>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
            </FormField>
            <FormField label="상태">
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputClass}>
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="시작일">
                <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputClass} />
              </FormField>
              <FormField label="종료일">
                <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className={inputClass} />
              </FormField>
            </div>
            <FormField label="예산">
              <input type="number" value={form.budget} onChange={(e) => set('budget', e.target.value)} className={inputClass} />
            </FormField>
            <FormField label="참여 인원">
              <input value={form.participants} onChange={(e) => set('participants', e.target.value)} className={inputClass} />
            </FormField>
            <FormField label="주요 산출물">
              <input value={form.deliverables} onChange={(e) => set('deliverables', e.target.value)} className={inputClass} />
            </FormField>
            <FormField label="관련 링크">
              <input value={form.relatedLinks} onChange={(e) => set('relatedLinks', e.target.value)} className={inputClass} />
            </FormField>
          </div>

          {/* 우측 - 긴 텍스트 */}
          <div className="space-y-3">
            <FormField label="목표">
              <textarea
                value={form.goal}
                onChange={(e) => set('goal', e.target.value)}
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </FormField>
            <FormField label="설명">
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                rows={12}
                className={`${inputClass} resize-none`}
              />
            </FormField>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-5 mt-5 border-t border-default">
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>
            취소
          </Button>
          <Button variant="primary" onClick={handleSave} leadingIcon={<Save size={16} />}>
            저장
          </Button>
        </div>
      </Card>
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
        <h1 className="h-page">프로젝트 목록</h1>
        <Button variant="primary" onClick={() => setShowForm(true)} leadingIcon={<Plus size={16} />}>
          새 프로젝트
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-danger-soft border border-default rounded-md text-on-danger text-sm">{error}</div>
      )}

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={40} />}
          title="프로젝트가 없습니다."
          description="새 프로젝트를 만들어보세요."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p) => {
            const daysLeft = p.endDate
              ? Math.ceil((new Date(p.endDate).getTime() - Date.now()) / 86400000)
              : null;
            const showDaysLeft = daysLeft !== null && p.status !== 'Done';

            return (
              <Card
                key={p.id}
                padding="normal"
                className="hover:border-strong transition-colors cursor-pointer group"
                onClick={() => openProject(p.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-primary group-hover:text-accent transition-colors">{p.name}</h3>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => handleBackup(p)} title="백업" className="p-1 text-muted hover:text-primary rounded transition-colors">
                      <Download size={14} />
                    </button>
                    <button onClick={() => setEditing(p)} title="수정" className="p-1 text-muted hover:text-primary rounded transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(p.id)} title="삭제" className="p-1 text-on-danger hover:opacity-80 rounded transition-opacity">
                      <X size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <ProjectStatusBadge status={p.status} />
                  {showDaysLeft && (
                    <Badge
                      size="sm"
                      variant={daysLeft < 0 ? 'danger' : daysLeft < 7 ? 'warning' : 'neutral'}
                    >
                      {daysLeft < 0 ? `${Math.abs(daysLeft)}일 초과` : `${daysLeft}일 남음`}
                    </Badge>
                  )}
                  {p.status === 'Done' && daysLeft !== null && (
                    <Badge size="sm" variant="success">완료</Badge>
                  )}
                </div>

                {p.goal && <p className="text-sm text-secondary line-clamp-2 mb-1">{p.goal}</p>}
                {p.description && <p className="text-sm text-muted line-clamp-2 mb-3">{p.description}</p>}

                <div className="flex flex-wrap gap-3 text-xs text-muted mt-3 pt-3 border-t border-default">
                  {(p.startDate || p.endDate) && (
                    <span className="flex items-center gap-1">
                      <Calendar size={14} />
                      {p.startDate?.slice(0, 10) ?? '-'} ~ {p.endDate?.slice(0, 10) ?? '-'}
                    </span>
                  )}
                  {p.participants && (
                    <span className="flex items-center gap-1">
                      <Users size={14} />
                      {p.participants}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showForm && <ProjectForm onSave={handleCreate} onCancel={() => setShowForm(false)} />}
      {editing && <ProjectForm initial={editing} onSave={handleUpdate} onCancel={() => setEditing(null)} />}
    </div>
  );
}
