import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, X, Download, Upload, FolderOpen, Calendar, Users } from 'lucide-react';
import { projectsApi } from '../api/projects';
import { wbsTemplatesApi } from '../api/wbsTemplates';
import { startPageApi } from '../api/startPage';
import { useProjectStore } from '../store/useProjectStore';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge';
import { WbsTemplatePicker, type TemplateApplySelection } from '../components/WbsTemplatePicker';
import { Button, Card, Modal, Badge, EmptyState } from '../components/ui';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { StartPageWidgets } from './projectList/StartPageWidgets';
import { ProjectForm } from './projects/ProjectForm';
import { getRecent, type RecentItem } from '../utils/recentItems';
import { useCreateForm } from '../hooks/useCreateForm';
import { DEFAULT_PROJECT_CATEGORIES } from '../types';
import type { ImportPreviewItem, Project, StartPageData } from '../types';

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

  // 구분 자유 텍스트 자동완성 후보 — 기존 프로젝트의 distinct 구분 값 + 기본 시드.
  const categorySuggestions = useMemo(
    () => Array.from(new Set([
      ...(projects.map((p) => p.category?.trim()).filter(Boolean) as string[]),
      ...DEFAULT_PROJECT_CATEGORIES,
    ])),
    [projects],
  );

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
          categorySuggestions={categorySuggestions}
          onSave={handleCreate}
          onSaveWithTemplate={handleCreateWithTemplate}
          onCancel={() => setShowForm(false)}
        />
      )}
      {editing && (
        <ProjectForm
          initial={editing}
          categorySuggestions={categorySuggestions}
          onSave={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      )}

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
