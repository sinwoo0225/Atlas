import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Pencil, X, Save, Download, Upload, FolderOpen, Calendar, Users, LayoutTemplate, FolderGit2, Check, AlertCircle } from 'lucide-react';
import { projectsApi } from '../api/projects';
import { gitApi } from '../api/git';
import { isHostBridgeAvailable, pickFolder, getConnectionConfig, type ConnectionMode } from '../utils/hostBridge';
import { wbsTemplatesApi } from '../api/wbsTemplates';
import { startPageApi } from '../api/startPage';
import { useProjectStore } from '../store/useProjectStore';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge';
import { WbsTemplatePicker, type TemplateApplySelection } from '../components/WbsTemplatePicker';
import { Button, Card, Modal, Badge, EmptyState, FormField, inputClass } from '../components/ui';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { StartPageWidgets } from './projectList/StartPageWidgets';
import { getRecent, type RecentItem } from '../utils/recentItems';
import { useGlobalShortcut } from '../hooks/useGlobalShortcut';
import type { ImportPreviewItem, Project, ProjectCategory, ProjectStatus, StartPageData } from '../types';

const statusOptions: { value: ProjectStatus; label: string }[] = [
  { value: 'Planned', label: '계획' },
  { value: 'Waiting', label: '대기' },
  { value: 'InProgress', label: '진행' },
  { value: 'Done', label: '완료' },
];

const categoryOptions: ProjectCategory[] = ['과제', '내부', '사업', '유지보수/하자보수'];

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
  const initialForm = {
    name: initial?.name ?? '',
    category: initial?.category ?? '',
    description: initial?.description ?? '',
    goal: initial?.goal ?? '',
    status: (initial?.status ?? 'Planned') as ProjectStatus,
    startDate: initial?.startDate?.slice(0, 10) ?? '',
    endDate: initial?.endDate?.slice(0, 10) ?? '',
    budget: initial?.budget?.toString() ?? '',
    participants: initial?.participants ?? '',
    deliverables: initial?.deliverables ?? '',
    relatedLinks: initial?.relatedLinks ?? '',
    gitRepoPath: initial?.gitRepoPath ?? '',
  };
  const [form, setForm] = useState(initialForm);
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Git 저장소 경로 — 폴더 선택기(데스크톱) + .git 유효성 검증.
  const bridgeAvailable = isHostBridgeAvailable();
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('Local');
  useEffect(() => { getConnectionConfig().then((c) => { if (c) setConnectionMode(c.mode); }); }, []);
  const isClientMode = connectionMode === 'Client';
  const [gitCheck, setGitCheck] = useState<{ valid: boolean; error: string | null } | null>(null);
  const [gitChecking, setGitChecking] = useState(false);

  const validateGitPath = async (path: string) => {
    const p = path.trim();
    if (!p) { setGitCheck(null); return; }
    setGitChecking(true);
    try {
      // validate 는 프로젝트와 무관(경로만 검사)하므로 신규 모드면 id 0 사용.
      const r = await gitApi.validate(initial?.id ?? 0, p);
      setGitCheck(r);
    } catch { setGitCheck(null); }
    finally { setGitChecking(false); }
  };

  const handlePickGitFolder = async () => {
    const picked = await pickFolder(form.gitRepoPath || undefined);
    if (picked) { set('gitRepoPath', picked); validateGitPath(picked); }
  };

  const buildPayload = () => ({
    ...form,
    budget: form.budget ? parseFloat(form.budget) : undefined,
    startDate: form.startDate || undefined,
    endDate: form.endDate || undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 폼 문자열 budget/date 를 변환한 payload, onSave 타입과 구조 동일
  } as any);

  const handleSave = () => onSave(buildPayload());

  return (
    <Modal
      open
      onClose={onCancel}
      title={initial?.id ? '프로젝트 수정' : '새 프로젝트'}
      size="xl"
      fixedHeight
      dirty={dirty}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>
            취소
          </Button>
          {onSaveWithTemplate && (
            <Button variant="secondary" onClick={() => onSaveWithTemplate(buildPayload())} leadingIcon={<LayoutTemplate size={16} />}>
              템플릿에서 시작
            </Button>
          )}
          <Button variant="primary" onClick={handleSave} leadingIcon={<Save size={16} />}>
            저장
          </Button>
        </>
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-full">
          {/* 좌측 - 기본 정보 */}
          <div className="space-y-3">
            <FormField label="프로젝트 구분">
              <select value={form.category} onChange={(e) => set('category', e.target.value)} className={inputClass}>
                <option value="">(미지정)</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </FormField>
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
            <FormField label="Git 저장소 경로">
              <div className="flex gap-2">
                <input
                  value={form.gitRepoPath}
                  onChange={(e) => { set('gitRepoPath', e.target.value); setGitCheck(null); }}
                  onBlur={(e) => validateGitPath(e.target.value)}
                  placeholder=".git 이 있는 소스코드 폴더 경로"
                  className={inputClass}
                />
                {bridgeAvailable && !isClientMode && (
                  <Button variant="secondary" onClick={handlePickGitFolder} leadingIcon={<FolderGit2 size={16} />} className="shrink-0">
                    찾기
                  </Button>
                )}
              </div>
              {isClientMode ? (
                <p className="text-xs text-muted mt-1">
                  Client 모드에서는 서버 머신 기준 경로여야 하며 Git 이력 보기는 Local 모드에서만 동작합니다.
                </p>
              ) : gitChecking ? (
                <p className="text-xs text-muted mt-1">확인 중…</p>
              ) : gitCheck ? (
                gitCheck.valid ? (
                  <p className="text-xs text-on-success mt-1 flex items-center gap-1">
                    <Check size={12} /> 유효한 git 저장소입니다. 변경 이력 → Git 이력 탭에서 확인하세요.
                  </p>
                ) : (
                  <p className="text-xs text-on-danger mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> {gitCheck.error}
                  </p>
                )
              ) : (
                <p className="text-xs text-muted mt-1">변경 이력 → Git 이력 탭에서 이 저장소의 커밋 그래프를 봅니다.</p>
              )}
            </FormField>
          </div>

          {/* 우측 - 긴 텍스트. 설명 textarea 가 남은 세로 공간 채움 */}
          <div className="flex flex-col gap-3 min-h-0">
            <FormField label="목표" className="shrink-0">
              <textarea
                value={form.goal}
                onChange={(e) => set('goal', e.target.value)}
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </FormField>
            <FormField label="설명" className="flex-1 flex flex-col min-h-0">
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

  useGlobalShortcut('mod+n', () => { setEditing(null); setShowForm(true); });

  useEffect(() => {
    projectsApi.getAll().then(setProjects).catch(() => setError('프로젝트 목록을 불러올 수 없습니다.'));
    startPageApi.get().then(setStartPageData).catch(() => { /* 신규 endpoint — 구버전 서버 호환 위해 무시 */ });
  }, [setProjects]);

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
      toast.success(p.name ? `새 프로젝트 '${p.name}' 이(가) 추가됐어요` : '새 프로젝트가 추가됐어요');
    } catch { setError('프로젝트 생성 실패'); }
  };

  // 프로젝트 생성 후 곧바로 템플릿 피커를 띄운다.
  const handleCreateWithTemplate = async (data: Omit<Project, 'id' | 'folderPath' | 'createdAt' | 'updatedAt'>) => {
    try {
      const p = await projectsApi.create(data);
      addProject(p);
      setShowForm(false);
      setTemplateTarget(p);
    } catch { setError('프로젝트 생성 실패'); }
  };

  const handleApplyTemplate = async (sel: TemplateApplySelection) => {
    if (!templateTarget) return;
    setApplyingTemplate(true);
    try {
      const r = await wbsTemplatesApi.apply(templateTarget.id, sel);
      toast.success(`'${templateTarget.name}' 에 작업 ${r.createdCount}개를 추가했어요.`);
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
    } catch { setError('프로젝트 수정 실패'); }
  };

  const handleDelete = async (id: number) => {
    if (!await confirmDialog({
      title: '프로젝트 삭제',
      message: '이 프로젝트를 삭제하시겠습니까? WBS, 회의록, 변경 이력 등 하위 데이터도 모두 함께 삭제되며 되돌릴 수 없습니다.',
      confirmLabel: '삭제',
      danger: true,
    })) return;
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

  const handleImportFileChosen = async (file: File) => {
    setImportFile(file);
    setImportPreview(null);
    setImporting(true);
    try {
      const items = await projectsApi.importPreview(file);
      if (items.length === 0) {
        toast.error('백업 안에 가져올 프로젝트가 없습니다.');
        setImportFile(null);
      } else {
        setImportPreview(items);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '백업 zip 분석 실패');
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
        `이슈 ${result.issuesImported}건 (담당자 매칭 ${result.issuesAssigneeMatched}, 누락 ${result.issuesAssigneeMissing})`,
        `WBS ${result.wbsItemsImported}건`,
        `회의 ${result.meetingsImported}건`,
      ];
      toast.success(`'${result.newProjectName}' 가져옴 — ${parts.join(', ')}`);
      for (const w of result.warnings) toast.warning(w, { duration: 8000 });
      // 목록 새로고침.
      projectsApi.getAll().then(setProjects).catch(() => {});
      setImportFile(null);
      setImportPreview(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '가져오기 실패');
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
        <h1 className="h-page">프로젝트 목록</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => importInputRef.current?.click()}
            leadingIcon={<Upload size={16} />}
            disabled={importing}
          >
            가져오기
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
            새 프로젝트
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
          title="프로젝트가 없습니다."
          description="새 프로젝트를 만들어보세요."
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
                      <button onClick={() => handleBackup(p)} title="백업" aria-label="백업" className="p-1 text-muted hover:text-primary rounded transition-colors">
                        <Download size={14} />
                      </button>
                      <button onClick={() => setEditing(p)} title="수정" aria-label="수정" className="p-1 text-muted hover:text-primary rounded transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(p.id)} title="삭제" aria-label="삭제" className="p-1 text-on-danger hover:opacity-80 rounded transition-opacity">
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
                          {daysLeft < 0 ? `${Math.abs(daysLeft)}일 초과` : `D-${daysLeft}`}
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
          title="가져올 프로젝트 선택"
          size="lg"
          showCloseButton
          footer={
            <Button variant="secondary" onClick={cancelImport} leadingIcon={<X size={16} />}>
              취소
            </Button>
          }
        >
          <div className="space-y-1">
            <p className="text-sm text-muted mb-3">
              백업 zip 안의 프로젝트 중 하나를 골라 현재 데이터에 새 프로젝트로 추가합니다.
              리소스 마스터는 가져오지 않으며, 이슈 담당자는 이메일로 자동 매칭합니다.
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
                      <Badge size="sm" variant="neutral">이슈 {p.issueCount}</Badge>
                      <Badge size="sm" variant="neutral">WBS {p.wbsCount}</Badge>
                      <Badge size="sm" variant="neutral">회의 {p.meetingCount}</Badge>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {importing && <div className="text-sm text-muted mt-3">가져오는 중...</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}
