import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, X, Save, Download, Upload, FolderOpen, Calendar, Users, LayoutTemplate } from 'lucide-react';
import { projectsApi } from '../api/projects';
import { wbsTemplatesApi } from '../api/wbsTemplates';
import { startPageApi } from '../api/startPage';
import { useProjectStore } from '../store/useProjectStore';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge';
import { WbsTemplatePicker, type TemplateApplySelection } from '../components/WbsTemplatePicker';
import { Button, Card, Modal, Badge, EmptyState, FormField, inputClass } from '../components/ui';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { StartPageWidgets } from './projectList/StartPageWidgets';
import { getRecent, type RecentItem } from '../utils/recentItems';
import { useCreateForm } from '../hooks/useCreateForm';
import type { ImportPreviewItem, Project, ProjectCategory, ProjectStatus, StartPageData } from '../types';

// 라벨은 status 네임스페이스 재사용 — 렌더 시점 t(labelKey).
const statusOptions: { value: ProjectStatus; labelKey: string }[] = [
  { value: 'Waiting', labelKey: 'status:project.Waiting' },
  { value: 'InProgress', labelKey: 'status:project.InProgress' },
  { value: 'Done', labelKey: 'status:project.Done' },
  { value: 'Maintenance', labelKey: 'status:project.Maintenance' },
];

// 카테고리는 저장 데이터값(한글 enum)이라 그대로 노출(범위 밖) — Phase 2 후속에서 표시 매핑 검토.
const categoryOptions: ProjectCategory[] = ['과제', '내부', '사업'];

function ProjectForm({
  initial,
  onSave,
  onSaveWithTemplate,
  onCancel,
}: {
  initial?: Partial<Project>;
  onSave: (data: Omit<Project, 'id' | 'folderPath' | 'createdAt' | 'updatedAt'>) => void;
  // 생성 모드에서만 — 프로젝트 생성 후 템플릿 선택 플로우로 이어감.
  onSaveWithTemplate?: (data: Omit<Project, 'id' | 'folderPath' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const initialForm = {
    name: initial?.name ?? '',
    category: initial?.category ?? '',
    description: initial?.description ?? '',
    goal: initial?.goal ?? '',
    status: (initial?.status ?? 'Waiting') as ProjectStatus,
    startDate: initial?.startDate?.slice(0, 10) ?? '',
    endDate: initial?.endDate?.slice(0, 10) ?? '',
    budget: initial?.budget?.toString() ?? '',
    participants: initial?.participants ?? '',
    deliverables: initial?.deliverables ?? '',
    relatedLinks: initial?.relatedLinks ?? '',
    gitRepoPath: initial?.gitRepoPath ?? '',
    completedDate: initial?.completedDate?.slice(0, 10) ?? '',
  };
  const [form, setForm] = useState(initialForm);
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // gitRepoPath 는 더 이상 프로젝트 폼에서 편집하지 않는다 — git 이력은 '업무 정보'(GitRepo 타입)로 이전됨.
  // 다만 기존 값 보존을 위해 initialForm/buildPayload 의 ...form 스프레드로 그대로 라운드트립한다
  // (ProjectService.UpdateAsync 가 null→empty 코얼레스라 payload 에서 빼면 컬럼이 비워짐).
  const buildPayload = () => ({
    ...form,
    budget: form.budget ? parseFloat(form.budget) : undefined,
    startDate: form.startDate || undefined,
    endDate: form.endDate || undefined,
    completedDate: form.completedDate || undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 폼 문자열 budget/date 를 변환한 payload, onSave 타입과 구조 동일
  } as any);

  const handleSave = () => onSave(buildPayload());

  return (
    <Modal
      open
      onClose={onCancel}
      title={initial?.id ? t('projects:form.editTitle') : t('projects:form.newTitle')}
      size="xl"
      fixedHeight
      dirty={dirty}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>
            {t('common:cancel')}
          </Button>
          {onSaveWithTemplate && (
            <Button variant="secondary" onClick={() => onSaveWithTemplate(buildPayload())} leadingIcon={<LayoutTemplate size={16} />}>
              {t('projects:form.startFromTemplate')}
            </Button>
          )}
          <Button variant="primary" onClick={handleSave} leadingIcon={<Save size={16} />}>
            {t('common:save')}
          </Button>
        </>
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-full">
          {/* 좌측 - 기본 정보 */}
          <div className="space-y-3">
            <FormField label={t('projects:form.category')}>
              <select value={form.category} onChange={(e) => set('category', e.target.value)} className={inputClass}>
                <option value="">{t('projects:form.categoryNone')}</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </FormField>
            <FormField label={t('projects:form.name')} required>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
            </FormField>
            <FormField label={t('projects:form.status')}>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputClass}>
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                ))}
              </select>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t('projects:form.startDate')}>
                <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputClass} />
              </FormField>
              <FormField label={t('projects:form.endDate')}>
                <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className={inputClass} />
              </FormField>
            </div>
            <FormField label={t('projects:form.completedDate')} hint={t('projects:form.completedHint')}>
              <input type="date" value={form.completedDate} onChange={(e) => set('completedDate', e.target.value)} className={inputClass} />
            </FormField>
            <FormField label={t('projects:form.budget')}>
              <input type="number" value={form.budget} onChange={(e) => set('budget', e.target.value)} className={inputClass} />
            </FormField>
            <FormField label={t('projects:form.participants')}>
              <input value={form.participants} onChange={(e) => set('participants', e.target.value)} className={inputClass} />
            </FormField>
            <FormField label={t('projects:form.deliverables')}>
              <input value={form.deliverables} onChange={(e) => set('deliverables', e.target.value)} className={inputClass} />
            </FormField>
            <FormField label={t('projects:form.relatedLinks')}>
              <input value={form.relatedLinks} onChange={(e) => set('relatedLinks', e.target.value)} className={inputClass} />
            </FormField>
          </div>

          {/* 우측 - 긴 텍스트. 설명 textarea 가 남은 세로 공간 채움 */}
          <div className="flex flex-col gap-3 min-h-0">
            <FormField label={t('projects:form.goal')} className="shrink-0">
              <textarea
                value={form.goal}
                onChange={(e) => set('goal', e.target.value)}
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </FormField>
            <FormField label={t('projects:form.description')} className="flex-1 flex flex-col min-h-0">
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                className={`${inputClass} resize-none flex-1 min-h-0`}
              />
            </FormField>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function ProjectList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projects, setProjects, selectProject, addProject, updateProject, removeProject } = useProjectStore();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [error, setError] = useState('');
  const [startPageData, setStartPageData] = useState<StartPageData>({ myOpenItems: [], dueSoonItems: [] });
  const [recent, setRecent] = useState<RecentItem[]>(() => getRecent());
  // 백업 zip 가져오기 — 파일 선택 → preview → 사용자가 한 항목 선택 → 본 import 호출 의 2-step UX.
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewItem[] | null>(null);
  const [importing, setImporting] = useState(false);
  // 새 프로젝트 생성 후 템플릿 적용 플로우 — 생성된 프로젝트를 들고 피커를 띄운다.
  const [templateTarget, setTemplateTarget] = useState<Project | null>(null);
  const [applyingTemplate, setApplyingTemplate] = useState(false);

  useCreateForm(() => { setEditing(null); setShowForm(true); });

  useEffect(() => {
    projectsApi.getAll().then(setProjects).catch(() => setError(t('projects:error.loadList')));
    startPageApi.get().then(setStartPageData).catch(() => { /* 신규 endpoint — 구버전 서버 호환 위해 무시 */ });
  }, [setProjects, t]);

  // useRecentTracker 가 pushRecent 후 'atlas:recent-updated' 이벤트 발화 — ProjectList 가 listening 해 즉시 갱신.
  useEffect(() => {
    const handler = () => setRecent(getRecent());
    window.addEventListener('atlas:recent-updated', handler);
    return () => window.removeEventListener('atlas:recent-updated', handler);
  }, []);

  const handleCreate = async (data: Omit<Project, 'id' | 'folderPath' | 'createdAt' | 'updatedAt'>) => {
    try {
      const p = await projectsApi.create(data);
      addProject(p);
      setShowForm(false);
      toast.success(p.name ? t('projects:toast.created', { name: p.name }) : t('projects:toast.createdNoName'));
    } catch { setError(t('projects:error.createFailed')); }
  };

  // 프로젝트 생성 후 곧바로 템플릿 피커를 띄운다.
  const handleCreateWithTemplate = async (data: Omit<Project, 'id' | 'folderPath' | 'createdAt' | 'updatedAt'>) => {
    try {
      const p = await projectsApi.create(data);
      addProject(p);
      setShowForm(false);
      setTemplateTarget(p);
    } catch { setError(t('projects:error.createFailed')); }
  };

  const handleApplyTemplate = async (sel: TemplateApplySelection) => {
    if (!templateTarget) return;
    setApplyingTemplate(true);
    try {
      const r = await wbsTemplatesApi.apply(templateTarget.id, sel);
      toast.success(t('projects:toast.templateApplied', { name: templateTarget.name, count: r.createdCount }));
      const id = templateTarget.id;
      setTemplateTarget(null);
      selectProject(id);
      navigate(`/projects/${id}/wbs`);
    } catch { /* client.ts 토스트 처리 */ }
    finally { setApplyingTemplate(false); }
  };

  const handleUpdate = async (data: Omit<Project, 'id' | 'folderPath' | 'createdAt' | 'updatedAt'>) => {
    if (!editing) return;
    try {
      const p = await projectsApi.update(editing.id, data);
      updateProject(p);
      setEditing(null);
    } catch { setError(t('projects:error.updateFailed')); }
  };

  const handleDelete = async (id: number) => {
    if (!await confirmDialog({
      title: t('projects:delete.title'),
      message: t('projects:delete.message'),
      confirmLabel: t('projects:delete.confirm'),
      danger: true,
    })) return;
    try {
      await projectsApi.delete(id);
      removeProject(id);
    } catch { setError(t('projects:error.deleteFailed')); }
  };

  const handleBackup = async (project: Project) => {
    try {
      await projectsApi.backup(project.id, project.name);
    } catch { setError(t('projects:error.backupFailed')); }
  };

  const handleImportFileChosen = async (file: File) => {
    setImportFile(file);
    setImportPreview(null);
    setImporting(true);
    try {
      const items = await projectsApi.importPreview(file);
      if (items.length === 0) {
        toast.error(t('projects:toast.noImportable'));
        setImportFile(null);
      } else {
        setImportPreview(items);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('projects:toast.previewFailed'));
      setImportFile(null);
    } finally {
      setImporting(false);
    }
  };

  const handleImportSelect = async (sourceId: number) => {
    if (!importFile) return;
    setImporting(true);
    try {
      const result = await projectsApi.import(importFile, sourceId);
      // 결과 토스트 — 매핑/누락 수치 노출.
      const parts = [
        t('projects:toast.importIssues', { imported: result.issuesImported, matched: result.issuesAssigneeMatched, missing: result.issuesAssigneeMissing }),
        t('projects:toast.importWbs', { count: result.wbsItemsImported }),
        t('projects:toast.importMeetings', { count: result.meetingsImported }),
      ];
      toast.success(t('projects:toast.imported', { name: result.newProjectName, summary: parts.join(', ') }));
      for (const w of result.warnings) toast.warning(w, { duration: 8000 });
      // 목록 새로고침.
      projectsApi.getAll().then(setProjects).catch(() => {});
      setImportFile(null);
      setImportPreview(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('projects:toast.importFailed'));
    } finally {
      setImporting(false);
    }
  };

  const cancelImport = () => {
    setImportFile(null);
    setImportPreview(null);
  };

  const openProject = (id: number) => {
    selectProject(id);
    navigate(`/projects/${id}/dashboard`);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="h-page">{t('projects:title')}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => importInputRef.current?.click()}
            leadingIcon={<Upload size={16} />}
            disabled={importing}
          >
            {t('projects:importBtn')}
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFileChosen(f);
              e.target.value = ''; // 같은 파일 재선택 허용
            }}
          />
          <Button variant="primary" onClick={() => setShowForm(true)} leadingIcon={<Plus size={16} />}>
            {t('projects:newBtn')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-danger-soft border border-default rounded-md text-on-danger text-sm">{error}</div>
      )}

      <StartPageWidgets
        myOpenItems={startPageData.myOpenItems}
        dueSoonItems={startPageData.dueSoonItems}
        recent={recent}
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={40} />}
          title={t('projects:empty.title')}
          description={t('projects:empty.desc')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p) => {
            const daysLeft = p.endDate
              // eslint-disable-next-line react-hooks/purity -- 표시용 D-day, 렌더 시점 현재시각이 의도된 값
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
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h3 className="font-medium text-primary group-hover:text-accent transition-colors min-w-0 truncate">{p.name}</h3>
                    {p.category && <Badge size="sm" variant="neutral" className="shrink-0">{p.category}</Badge>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button onClick={() => handleBackup(p)} title={t('projects:card.backup')} aria-label={t('projects:card.backup')} className="p-1 text-muted hover:text-primary rounded transition-colors">
                        <Download size={14} />
                      </button>
                      <button onClick={() => setEditing(p)} title={t('projects:card.edit')} aria-label={t('projects:card.edit')} className="p-1 text-muted hover:text-primary rounded transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(p.id)} title={t('projects:card.delete')} aria-label={t('projects:card.delete')} className="p-1 text-on-danger hover:opacity-80 rounded transition-opacity">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ProjectStatusBadge status={p.status} />
                      {showDaysLeft && (
                        <Badge
                          size="sm"
                          variant={daysLeft < 0 ? 'danger' : daysLeft < 7 ? 'warning' : 'neutral'}
                        >
                          {daysLeft < 0 ? t('projects:card.daysOver', { days: Math.abs(daysLeft) }) : t('projects:card.dday', { days: daysLeft })}
                        </Badge>
                      )}
                    </div>
                  </div>
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

      {showForm && (
        <ProjectForm
          onSave={handleCreate}
          onSaveWithTemplate={handleCreateWithTemplate}
          onCancel={() => setShowForm(false)}
        />
      )}
      {editing && <ProjectForm initial={editing} onSave={handleUpdate} onCancel={() => setEditing(null)} />}

      <WbsTemplatePicker
        open={templateTarget !== null}
        onClose={() => setTemplateTarget(null)}
        onApply={handleApplyTemplate}
        defaultAnchorDate={templateTarget?.startDate ?? ''}
        busy={applyingTemplate}
      />

      {importPreview && (
        <Modal
          open
          onClose={cancelImport}
          title={t('projects:importModal.title')}
          size="lg"
          showCloseButton
          footer={
            <Button variant="secondary" onClick={cancelImport} leadingIcon={<X size={16} />}>
              {t('common:cancel')}
            </Button>
          }
        >
          <div className="space-y-1">
            <p className="text-sm text-muted mb-3">
              {t('projects:importModal.desc')}
            </p>
            <div className="border border-default rounded-md divide-y divide-default max-h-[60vh] overflow-y-auto">
              {importPreview.map((p) => (
                <button
                  key={p.id}
                  disabled={importing}
                  onClick={() => handleImportSelect(p.id)}
                  className="w-full text-left p-3 hover:bg-elevated disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-primary truncate">{p.name}</div>
                      {p.description && (
                        <div className="text-sm text-muted truncate mt-0.5">{p.description}</div>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-2 text-xs text-muted">
                      <Badge size="sm" variant="neutral">{t('projects:importModal.issueCount', { count: p.issueCount })}</Badge>
                      <Badge size="sm" variant="neutral">{t('projects:importModal.wbsCount', { count: p.wbsCount })}</Badge>
                      <Badge size="sm" variant="neutral">{t('projects:importModal.meetingCount', { count: p.meetingCount })}</Badge>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {importing && <div className="text-sm text-muted mt-3">{t('projects:importModal.importing')}</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}
