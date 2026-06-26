import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { FileText, Folder, Link as LinkIcon, Plus, Pencil, X, Save, Code2, Upload, FolderOpen, Search, ArrowUpDown, ChevronRight, FolderGit2, Check, AlertCircle, Star } from 'lucide-react';
import { devInfoApi } from '../api/devinfo';
import { FavoriteStar } from '../components/FavoriteStar';
import { favoritesFirst } from '../utils/favorites';
import { gitApi } from '../api/git';
import { GitHistoryView } from '../components/GitHistoryView';
import type { DevInfoItem, DevInfoType, DevInfoStorageMode, Project } from '../types';
import { projectsApi } from '../api/projects';
import { Button, Card, Modal, Input, Badge, EmptyState, FilterBar, Skeleton, FormField, inputClass } from '../components/ui';
import { devInfoTypeBadge } from '../utils/statusMaps';
import { applyTextareaTab } from '../utils/textareaTab';
import { isHostBridgeAvailable, pickFile, pickFolder, getConnectionConfig, type ConnectionMode } from '../utils/hostBridge';
import { useHighlightFromQuery } from '../hooks/useHighlightFromQuery';
import { useCreateForm } from '../hooks/useCreateForm';
import { TagSuggestionInput } from '../components/TagSuggestionInput';
import { TagManageModal } from '../components/devinfo/TagManageModal';
import { parseTagTokens } from '../utils/devInfoTagTokens';
import { Tag as TagIcon } from 'lucide-react';

const typeIcon: Record<DevInfoType, React.ComponentType<{ size?: number; className?: string }>> = {
  Markdown: FileText,
  File: Folder,
  Link: LinkIcon,
  GitRepo: FolderGit2,
};

const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
const textExts = ['txt', 'md', 'json', 'csv', 'xml', 'yaml', 'yml', 'log'];

function getExt(path: string): string {
  const idx = path.lastIndexOf('.');
  return idx >= 0 ? path.slice(idx + 1).toLowerCase() : '';
}

function DevInfoForm({
  projectId,
  project,
  initial,
  availableTags,
  onSave,
  onCancel,
}: {
  projectId: number;
  project: Project | null;
  initial?: DevInfoItem;
  availableTags: string[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const initialForm = {
    title: initial?.title ?? '',
    type: initial?.type ?? 'Markdown' as DevInfoType,
    storageMode: initial?.storageMode ?? 'Copy' as DevInfoStorageMode,
    content: initial?.content ?? '',
    filePath: initial?.filePath ?? '',
    url: initial?.url ?? '',
    tags: initial?.tags ?? '',
  };
  const [form, setForm] = useState(initialForm);
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bridgeAvailable = isHostBridgeAvailable();
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('Local');
  useEffect(() => {
    getConnectionConfig().then((c) => { if (c) setConnectionMode(c.mode); });
  }, []);
  // Client 모드에서는 Reference 모드 비활성: 클라이언트가 고른 경로를 서버가 열 수 없음.
  // 기존 Reference 항목을 편집 중이면 그대로 두되, 새로 만들 때는 Copy 만 선택지.
  const isClientMode = connectionMode === 'Client';
  const referenceForbidden = isClientMode && !(initial && initial.storageMode === 'Reference');
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // GitRepo 타입 — 저장소 폴더 선택 + .git 유효성 검증 (ProjectList 의 git 폼 패턴 재사용).
  const [gitCheck, setGitCheck] = useState<{ valid: boolean; error: string | null } | null>(null);
  const [gitChecking, setGitChecking] = useState(false);
  const validateGitPath = async (path: string) => {
    const p = path.trim();
    if (!p) { setGitCheck(null); return; }
    setGitChecking(true);
    try { setGitCheck(await gitApi.validate(projectId, p)); }
    catch { setGitCheck(null); }
    finally { setGitChecking(false); }
  };
  const handlePickGitFolder = async () => {
    const picked = await pickFolder(form.filePath || undefined);
    if (picked) { set('filePath', picked); validateGitPath(picked); }
  };

  const handleSubmit = async () => {
    // GitRepo 는 외부 저장소 참조 — 항상 Reference (삭제 시 원본 저장소 보존).
    const payload = { projectId, ...form, storageMode: form.type === 'GitRepo' ? ('Reference' as DevInfoStorageMode) : form.storageMode };
    if (initial) {
      await devInfoApi.update(projectId, initial.id, payload);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload 리터럴↔CreateDevInfoDto 구조 일치, 캐스트만 필요
      await devInfoApi.create(payload as any);
      toast.success(form.title.trim() ? t('devinfo:toast.created', { title: form.title.trim() }) : t('devinfo:toast.createdNoName'));
    }
    onSave();
  };

  const handleFileChosen = async (file: File) => {
    if (!project?.folderPath) {
      toast.warning(t('devinfo:form.noFolderInfo'));
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const url = `/api/projects/${projectId}/devinfo/upload?projectFolder=${encodeURIComponent(project.folderPath)}`;
      const res = await fetch(url, { method: 'POST', body: formData });
      if (!res.ok) throw new Error('upload failed');
      const data = await res.json();
      if (data?.filePath) set('filePath', data.filePath);
    } catch {
      toast.error(t('devinfo:form.uploadFailed'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title={initial ? t('devinfo:form.editTitle') : t('devinfo:form.newTitle')}
      size="xxl"
      fixedHeight
      dirty={dirty}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>{t('common:cancel')}</Button>
          <Button variant="primary" onClick={handleSubmit} leadingIcon={<Save size={16} />}>{t('common:save')}</Button>
        </>
      }
    >
      <div className="flex-1 min-h-0 flex flex-col -mx-2 px-2 gap-4">
        <FormField label={t('devinfo:form.title')} required>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputClass} />
        </FormField>

        <div>
          <label className="block text-xs text-muted font-medium mb-1">{t('devinfo:form.type')}</label>
          <div className="flex gap-2">
            {(['Markdown', 'File', 'Link', 'GitRepo'] as DevInfoType[]).map((dt) => {
              const Icon = typeIcon[dt];
              return (
                <Button
                  key={dt}
                  variant={form.type === dt ? 'primary' : 'secondary'}
                  size="md"
                  onClick={() => set('type', dt)}
                  leadingIcon={<Icon size={14} />}
                >
                  {dt}
                </Button>
              );
            })}
          </div>
        </div>

        {form.type === 'Markdown' && (
          <FormField label={t('devinfo:form.contentMd')} hint={t('devinfo:form.contentMdHint')} className="flex-1 min-h-0">
            <textarea
              value={form.content}
              onChange={(e) => set('content', e.target.value)}
              onKeyDown={(e) => applyTextareaTab(e, (next) => set('content', next))}
              className={`${inputClass} font-mono flex-1 min-h-0`}
            />
          </FormField>
        )}

        {form.type === 'File' && (
          <>
            <FormField label={t('devinfo:form.storageMode')}>
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="storageMode"
                    checked={form.storageMode === 'Copy'}
                    onChange={() => { set('storageMode', 'Copy'); set('filePath', ''); }}
                    className="mt-1"
                  />
                  <span className="text-sm">
                    <span className="text-primary font-medium">{t('devinfo:form.copyMode')}</span>
                    <span className="text-xs text-muted ml-2">{t('devinfo:form.copyModeRec')}</span>
                    <span className="block text-xs text-muted">{t('devinfo:form.copyModeDesc')}</span>
                  </span>
                </label>
                <label className={`flex items-start gap-2 ${referenceForbidden ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input
                    type="radio"
                    name="storageMode"
                    checked={form.storageMode === 'Reference'}
                    disabled={referenceForbidden}
                    onChange={() => { set('storageMode', 'Reference'); set('filePath', ''); }}
                    className="mt-1"
                  />
                  <span className="text-sm">
                    <span className="text-primary font-medium">{t('devinfo:form.refMode')}</span>
                    <span className="block text-xs text-muted">{t('devinfo:form.refModeDesc')}</span>
                    {referenceForbidden && (
                      <span className="block text-xs text-on-warning mt-1">{t('devinfo:form.refModeClientWarn')}</span>
                    )}
                  </span>
                </label>
              </div>
            </FormField>

            <FormField label={t('devinfo:form.filePath')}>
              <div className="flex gap-2">
                <input
                  value={form.filePath}
                  onChange={(e) => set('filePath', e.target.value)}
                  placeholder={form.storageMode === 'Reference' ? t('devinfo:form.filePathPlaceholderRef') : t('devinfo:form.filePathPlaceholderCopy')}
                  className={inputClass}
                  readOnly={form.storageMode === 'Copy'}
                />
                {form.storageMode === 'Copy' ? (
                  <Button
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    leadingIcon={<Upload size={16} />}
                  >
                    {uploading ? t('devinfo:form.uploading') : t('devinfo:form.browseUpload')}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      const path = await pickFile({ title: t('devinfo:form.pickFileTitle') });
                      if (path) set('filePath', path);
                    }}
                    disabled={!bridgeAvailable}
                    leadingIcon={<FolderOpen size={16} />}
                  >
                    {t('devinfo:form.pickFile')}
                  </Button>
                )}
              </div>
              {form.storageMode === 'Reference' && !bridgeAvailable && (
                <p className="text-xs text-muted mt-1">{t('devinfo:form.nativeOnlyHint')}</p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileChosen(f);
                }}
              />
            </FormField>
          </>
        )}

        {form.type === 'Link' && (
          <FormField label={t('devinfo:form.url')}>
            <input
              value={form.url}
              onChange={(e) => set('url', e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </FormField>
        )}

        {form.type === 'GitRepo' && (
          <FormField label={t('devinfo:form.gitRepoPath')}>
            <div className="flex gap-2">
              <input
                value={form.filePath}
                onChange={(e) => { set('filePath', e.target.value); setGitCheck(null); }}
                onBlur={(e) => validateGitPath(e.target.value)}
                placeholder={t('devinfo:form.gitRepoPlaceholder')}
                className={inputClass}
              />
              {bridgeAvailable && !isClientMode && (
                <Button variant="secondary" onClick={handlePickGitFolder} leadingIcon={<FolderGit2 size={16} />} className="shrink-0">
                  {t('devinfo:form.browse')}
                </Button>
              )}
            </div>
            {isClientMode ? (
              <p className="text-xs text-muted mt-1">{t('devinfo:form.gitClientHint')}</p>
            ) : gitChecking ? (
              <p className="text-xs text-muted mt-1">{t('devinfo:form.gitChecking')}</p>
            ) : gitCheck ? (
              gitCheck.valid ? (
                <p className="text-xs text-on-success mt-1 flex items-center gap-1">
                  <Check size={12} /> {t('devinfo:form.gitValid')}
                </p>
              ) : (
                <p className="text-xs text-on-danger mt-1 flex items-center gap-1">
                  <AlertCircle size={12} /> {gitCheck.error}
                </p>
              )
            ) : (
              <p className="text-xs text-muted mt-1">{t('devinfo:form.gitHint')}</p>
            )}
          </FormField>
        )}

        <FormField label={t('devinfo:form.tags')} hint={t('devinfo:form.tagsHint')}>
          <TagSuggestionInput
            value={form.tags}
            onChange={(v) => set('tags', v)}
            suggestions={availableTags}
            placeholder={t('devinfo:form.tagsPlaceholder')}
          />
        </FormField>
      </div>
    </Modal>
  );
}

function FilePreview({ projectId, item }: { projectId: number; item: DevInfoItem }) {
  const { t } = useTranslation();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const ext = getExt(item.filePath);

  useEffect(() => {
    setText(null);
    setError(null);
    setImgError(false);
    if (!item.filePath) return;
    if (textExts.includes(ext)) {
      fetch(`/api/projects/${projectId}/devinfo/${item.id}/preview`)
        .then(async (r) => {
          if (!r.ok) throw new Error('not found');
          const data = await r.json();
          setText(data.text ?? '');
        })
        .catch(() => setError(t('devinfo:preview.loadError')));
    }
  }, [projectId, item.id, item.filePath, ext, item.updatedAt, t]);

  if (!item.filePath) return <p className="text-sm text-muted">{t('devinfo:preview.noPath')}</p>;

  if (imageExts.includes(ext)) {
    if (imgError) {
      return (
        <p className="text-sm text-on-danger">
          {t('devinfo:preview.imageError', { path: item.filePath })}
        </p>
      );
    }
    const cacheBust = encodeURIComponent(item.updatedAt || '');
    return (
      <img
        src={`/api/projects/${projectId}/devinfo/${item.id}/preview?t=${cacheBust}`}
        alt={item.title}
        className="max-w-full rounded border border-default"
        onError={() => setImgError(true)}
      />
    );
  }

  if (textExts.includes(ext)) {
    if (error) return <p className="text-sm text-on-danger">{error}</p>;
    if (text === null) return <p className="text-sm text-muted">{t('common:loading')}</p>;
    if (ext === 'md') {
      return (
        <div className="markdown-body markdown-body--wide text-secondary">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
      );
    }
    return (
      <pre className="text-xs text-secondary bg-base border border-default rounded-md p-3 overflow-auto whitespace-pre-wrap">
        {text}
      </pre>
    );
  }

  return null;
}

export function DevInfoPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = parseInt(projectId!);
  const [items, setItems] = useState<DevInfoItem[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [tagManageOpen, setTagManageOpen] = useState(false);
  const [editing, setEditing] = useState<DevInfoItem | null>(null);
  const [selected, setSelected] = useState<DevInfoItem | null>(null);

  useCreateForm(() => { setEditing(null); setShowForm(true); });
  const [filterType, setFilterType] = useState<DevInfoType | ''>('');
  const [keyword, setKeyword] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [tagSort, setTagSort] = useState<'alpha' | 'freq'>(
    () => (localStorage.getItem('atlas:devInfoTagSort') as 'alpha' | 'freq') || 'alpha',
  );
  // tagSort 토글 시 load 의 deps 변경으로 스켈레톤이 깜빡이는 걸 막기 위해 ref 로 우회.
  const tagSortRef = useRef(tagSort);
  useEffect(() => { tagSortRef.current = tagSort; }, [tagSort]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [is, tags, p] = await Promise.all([
        devInfoApi.getByProject(pid),
        devInfoApi.getDistinctTags(pid, tagSortRef.current).catch(() => [] as string[]),
        projectsApi.getById(pid).catch(() => null),
      ]);
      setItems(is);
      setAvailableTags(tags);
      setProject(p);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [pid]);

  // CRUD 후 silent refresh.
  const refresh = useCallback(() => {
    devInfoApi.getByProject(pid).then(setItems).catch(() => {});
    devInfoApi.getDistinctTags(pid, tagSortRef.current).then(setAvailableTags).catch(() => {});
  }, [pid]);

  const handleSortChange = (next: 'alpha' | 'freq') => {
    setTagSort(next);
    localStorage.setItem('atlas:devInfoTagSort', next);
    devInfoApi.getDistinctTags(pid, next).then(setAvailableTags).catch(() => {});
  };

  useEffect(() => { load(); }, [load]);

  useHighlightFromQuery([items.length]);

  const handleDelete = async (id: number) => {
    if (!await confirmDialog({
      title: t('devinfo:delete.title'),
      message: t('devinfo:delete.message'),
      confirmLabel: t('common:delete'),
      danger: true,
    })) return;
    await devInfoApi.delete(pid, id);
    if (selected?.id === id) setSelected(null);
    refresh();
  };

  const handleOpenFile = async (item: DevInfoItem) => {
    try {
      const res = await fetch(`/api/projects/${pid}/devinfo/${item.id}/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        toast.error(t('devinfo:toast.openFailed', { msg: msg ? ` (${msg})` : '' }));
      }
    } catch (e) {
      toast.error(t('devinfo:toast.openError', { msg: (e as Error).message }));
    }
  };

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const selectedSet = new Set(selectedTags.map((t) => t.toLowerCase()));
    return favoritesFirst(items.filter((i) => {
      if (filterType && i.type !== filterType) return false;
      if (favOnly && !i.isFavorite) return false;
      if (selectedSet.size > 0) {
        const itemTags = parseTagTokens(i.tags).map((t) => t.toLowerCase());
        if (!itemTags.some((t) => selectedSet.has(t))) return false;
      }
      if (kw) {
        const hay = `${i.title} ${i.tags ?? ''} ${i.content ?? ''} ${i.url ?? ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    }));
  }, [items, filterType, selectedTags, favOnly, keyword]);

  // 즐겨찾기 토글 — 낙관적 갱신 후 영속(실패 시 롤백).
  const toggleFavorite = useCallback((item: DevInfoItem) => {
    const next = !item.isFavorite;
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, isFavorite: next } : x)));
    devInfoApi.toggleFavorite(pid, item.id, next).catch(() => {
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, isFavorite: !next } : x)));
    });
  }, [pid]);

  return (
    <div className="p-6 h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="h-page flex items-center gap-2 min-w-0">
          <Code2 size={18} className="text-muted shrink-0" />
          {project && (
            <>
              <span className="text-muted font-normal truncate">{project.name}</span>
              <ChevronRight size={14} className="text-muted shrink-0" />
            </>
          )}
          <span className="shrink-0">{t('devinfo:title')}</span>
        </h1>
        <Button variant="primary" onClick={() => setShowForm(true)} leadingIcon={<Plus size={16} />}>
          {t('devinfo:newBtn')}
        </Button>
      </div>

      {loading ? (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
          <div className="lg:col-span-1 space-y-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Card key={i} padding="normal">
                <Skeleton height={14} width="40%" />
                <Skeleton height={16} width="80%" className="mt-2" />
              </Card>
            ))}
          </div>
          <Card padding="spacious" className="lg:col-span-2">
            <Skeleton height={20} width="40%" />
            <div className="mt-4"><Skeleton height={12} count={6} /></div>
          </Card>
        </div>
      ) : error ? (
        <Card padding="spacious">
          <EmptyState error={error} onRetry={load} />
        </Card>
      ) : (
      <>
      <FilterBar className="flex-col items-stretch">
      <div className="flex gap-2 flex-wrap items-center">
        <Button
          variant={!filterType ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setFilterType('')}
        >
          {t('devinfo:filterAll')}
        </Button>
        {(['Markdown', 'File', 'Link', 'GitRepo'] as DevInfoType[]).map((dt) => {
          const Icon = typeIcon[dt];
          return (
            <Button
              key={dt}
              variant={filterType === dt ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setFilterType(dt === filterType ? '' : dt)}
              leadingIcon={<Icon size={14} />}
            >
              {dt}
            </Button>
          );
        })}
        <Button
          variant={favOnly ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setFavOnly((v) => !v)}
          leadingIcon={<Star size={14} className={favOnly ? 'fill-current' : ''} />}
        >
          {t('common:favorite.onlyFavorites')}
        </Button>
        <Input
          type="search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t('devinfo:searchPlaceholder')}
          leadingIcon={<Search size={14} />}
          inputSize="sm"
          fullWidth={false}
          wrapperClassName="ml-auto w-72"
        />
      </div>

      {availableTags.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-muted shrink-0 mr-1">{t('devinfo:tagsLabel')}</span>
          {availableTags.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <Button
                key={tag}
                variant={active ? 'primary' : 'secondary'}
                size="sm"
                onClick={() =>
                  setSelectedTags((prev) =>
                    prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                  )
                }
              >
                {tag}
              </Button>
            );
          })}
          {selectedTags.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedTags([])}>
              {t('devinfo:resetTags')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTagManageOpen(true)}
            leadingIcon={<TagIcon size={12} />}
            className="ml-auto"
          >
            {t('devinfo:tagManage')}
          </Button>
          <div
            role="group"
            aria-label={t('devinfo:tagSortAria')}
            className="flex items-center gap-1 text-xs text-muted shrink-0"
          >
            <ArrowUpDown size={12} aria-hidden="true" />
            <button
              type="button"
              onClick={() => handleSortChange('alpha')}
              className={`px-2 py-0.5 rounded transition-colors ${tagSort === 'alpha' ? 'bg-surface-2 text-primary' : 'hover:text-primary'}`}
              aria-pressed={tagSort === 'alpha'}
            >
              {t('devinfo:sortAlpha')}
            </button>
            <button
              type="button"
              onClick={() => handleSortChange('freq')}
              className={`px-2 py-0.5 rounded transition-colors ${tagSort === 'freq' ? 'bg-surface-2 text-primary' : 'hover:text-primary'}`}
              aria-pressed={tagSort === 'freq'}
            >
              {t('devinfo:sortFreq')}
            </button>
          </div>
        </div>
      )}
      </FilterBar>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        <div className="lg:col-span-1 overflow-y-auto space-y-2">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Code2 size={36} />}
              title={items.length === 0 ? t('devinfo:empty.titleNone') : t('devinfo:empty.titleFiltered')}
              description={items.length === 0
                ? t('devinfo:empty.descNone')
                : (filterType || keyword || selectedTags.length > 0) ? t('devinfo:empty.descAdjust') : t('devinfo:empty.descEmpty')}
            />
          ) : filtered.map((item) => {
            const Icon = typeIcon[item.type];
            const isSelected = selected?.id === item.id;
            return (
              <Card
                key={item.id}
                data-highlight-id={item.id}
                padding="normal"
                className={`cursor-pointer transition-colors ${isSelected ? 'border-accent ring-1 ring-accent' : 'hover:border-strong'}`}
                onClick={() => setSelected(isSelected ? null : item)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={devInfoTypeBadge[item.type].variant} size="sm">
                        <Icon size={12} className="mr-1" /> {item.type}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium text-primary truncate">{item.title}</p>
                    {item.tags && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.tags.split(',').map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                          <Badge key={tag} variant="neutral" size="sm">{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <FavoriteStar active={!!item.isFavorite} onToggle={() => toggleFavorite(item)} size={15} />
                    <button onClick={() => setEditing(item)} className="p-1 text-muted hover:text-primary transition-colors" title={t('common:edit')} aria-label={t('devinfo:card.editAria', { title: item.title })}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="p-1 text-on-danger hover:opacity-80 transition-opacity" title={t('common:delete')} aria-label={t('devinfo:card.deleteAria', { title: item.title })}>
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <Card padding="spacious" className="lg:col-span-2 overflow-y-auto">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-muted">
              <p className="text-sm">{t('devinfo:detail.selectPrompt')}</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Badge variant={devInfoTypeBadge[selected.type].variant}>{selected.type}</Badge>
                <h2 className="h-section">{selected.title}</h2>
              </div>

              {selected.type === 'Markdown' && (
                <div className="markdown-body markdown-body--wide text-secondary">
                  <ReactMarkdown>{selected.content}</ReactMarkdown>
                </div>
              )}

              {selected.type === 'File' && (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted mb-1">{t('devinfo:detail.filePath')}</p>
                    <p className="text-sm text-secondary font-mono bg-surface-2 px-3 py-2 rounded-md break-all border border-default">
                      {selected.filePath}
                    </p>
                  </div>
                  <FilePreview projectId={pid} item={selected} />
                  <Button variant="secondary" onClick={() => handleOpenFile(selected)} leadingIcon={<Folder size={16} />}>
                    {t('devinfo:detail.openFile')}
                  </Button>
                </div>
              )}

              {selected.type === 'Link' && (
                <div className="space-y-2">
                  <p className="text-xs text-muted">{t('devinfo:detail.link')}</p>
                  <a href={selected.url} target="_blank" rel="noreferrer" className="text-sm text-secondary hover:text-primary hover:underline break-all transition-colors">
                    {selected.url}
                  </a>
                  {selected.content && (
                    <div className="mt-4 pt-4 border-t border-default">
                      <p className="text-sm text-secondary whitespace-pre-wrap">{selected.content}</p>
                    </div>
                  )}
                </div>
              )}

              {selected.type === 'GitRepo' && (
                <GitHistoryView projectId={pid} devInfoId={selected.id} />
              )}

              {selected.tags && (
                <div className="mt-4 pt-4 border-t border-default flex flex-wrap gap-1">
                  {selected.tags.split(',').map((t) => t.trim()).filter(Boolean).map((tag) => (
                    <Badge key={tag} variant="neutral">{tag}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
      </>
      )}

      {showForm && (
        <DevInfoForm
          projectId={pid}
          project={project}
          availableTags={availableTags}
          onSave={() => { setShowForm(false); refresh(); }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {editing && (
        <DevInfoForm
          projectId={pid}
          project={project}
          initial={editing}
          availableTags={availableTags}
          onSave={() => { setEditing(null); refresh(); }}
          onCancel={() => setEditing(null)}
        />
      )}
      <TagManageModal
        open={tagManageOpen}
        projectId={pid}
        tags={availableTags}
        onClose={() => setTagManageOpen(false)}
        onChanged={refresh}
      />
    </div>
  );
}
