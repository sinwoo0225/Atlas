import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { FileText, Folder, Link as LinkIcon, Plus, Pencil, X, Save, Code2, Upload, FolderOpen, Search } from 'lucide-react';
import { devInfoApi } from '../api/devinfo';
import type { DevInfoItem, DevInfoType, DevInfoStorageMode, Project } from '../types';
import { projectsApi } from '../api/projects';
import { Button, Card, Badge, EmptyState, FormField, inputClass } from '../components/ui';
import { devInfoTypeBadge } from '../utils/statusMaps';
import { applyTextareaTab } from '../utils/textareaTab';
import { isHostBridgeAvailable, pickFile, getConnectionConfig, type ConnectionMode } from '../utils/hostBridge';
import { useHighlightFromQuery } from '../hooks/useHighlightFromQuery';
import { TagSuggestionInput } from '../components/TagSuggestionInput';
import { parseTagTokens } from '../utils/devInfoTagTokens';

const typeIcon: Record<DevInfoType, React.ComponentType<{ size?: number; className?: string }>> = {
  Markdown: FileText,
  File: Folder,
  Link: LinkIcon,
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
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    type: initial?.type ?? 'Markdown' as DevInfoType,
    storageMode: initial?.storageMode ?? 'Copy' as DevInfoStorageMode,
    content: initial?.content ?? '',
    filePath: initial?.filePath ?? '',
    url: initial?.url ?? '',
    tags: initial?.tags ?? '',
  });
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

  const handleSubmit = async () => {
    const payload = { projectId, ...form };
    if (initial) await devInfoApi.update(projectId, initial.id, payload);
    else await devInfoApi.create(payload as any);
    onSave();
  };

  const handleFileChosen = async (file: File) => {
    if (!project?.folderPath) {
      toast.warning('프로젝트 폴더 정보를 알 수 없습니다.');
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
      toast.error('파일 업로드 실패');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="modal-overlay fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card padding="spacious" className="w-full max-w-2xl space-y-4 my-4">
        <h2 className="h-section">{initial ? '정보 수정' : '개발 정보 추가'}</h2>

        <FormField label="제목" required>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputClass} />
        </FormField>

        <div>
          <label className="block text-xs text-muted font-medium mb-1">타입</label>
          <div className="flex gap-2">
            {(['Markdown', 'File', 'Link'] as DevInfoType[]).map((t) => {
              const Icon = typeIcon[t];
              return (
                <Button
                  key={t}
                  variant={form.type === t ? 'primary' : 'secondary'}
                  size="md"
                  onClick={() => set('type', t)}
                  leadingIcon={<Icon size={14} />}
                >
                  {t}
                </Button>
              );
            })}
          </div>
        </div>

        {form.type === 'Markdown' && (
          <FormField label="내용 (Markdown)" hint="저장 시 프로젝트 폴더에 [제목].md 파일로 저장됩니다.">
            <textarea
              value={form.content}
              onChange={(e) => set('content', e.target.value)}
              onKeyDown={(e) => applyTextareaTab(e, (next) => set('content', next))}
              rows={10}
              className={`${inputClass} resize-none font-mono`}
            />
          </FormField>
        )}

        {form.type === 'File' && (
          <>
            <FormField label="저장 방식">
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
                    <span className="text-primary font-medium">데이터 폴더로 카피</span>
                    <span className="text-xs text-muted ml-2">(권장 — 백업 zip 에 포함됨)</span>
                    <span className="block text-xs text-muted">선택한 파일을 프로젝트 폴더의 DevFiles 로 복사합니다.</span>
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
                    <span className="text-primary font-medium">원위치 경로만 저장</span>
                    <span className="block text-xs text-muted">파일을 옮기지 않고 절대경로만 저장합니다. 백업 zip 에 포함되지 않으며, 원본이 이동/삭제되면 열 수 없습니다.</span>
                    {referenceForbidden && (
                      <span className="block text-xs text-on-warning mt-1">Client 모드에서는 사용할 수 없습니다 — 클라이언트가 고른 경로를 서버가 열 수 없기 때문.</span>
                    )}
                  </span>
                </label>
              </div>
            </FormField>

            <FormField label="파일 경로">
              <div className="flex gap-2">
                <input
                  value={form.filePath}
                  onChange={(e) => set('filePath', e.target.value)}
                  placeholder={form.storageMode === 'Reference' ? 'C:\\... (절대경로)' : '파일 찾기 후 자동 표시'}
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
                    {uploading ? '업로드 중...' : '파일 찾기'}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      const path = await pickFile({ title: '원본 파일 선택' });
                      if (path) set('filePath', path);
                    }}
                    disabled={!bridgeAvailable}
                    leadingIcon={<FolderOpen size={16} />}
                  >
                    파일 선택
                  </Button>
                )}
              </div>
              {form.storageMode === 'Reference' && !bridgeAvailable && (
                <p className="text-xs text-muted mt-1">데스크톱 앱에서만 네이티브 다이얼로그를 쓸 수 있어요. 브라우저에서는 경로를 직접 입력하세요.</p>
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
          <FormField label="URL">
            <input
              value={form.url}
              onChange={(e) => set('url', e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </FormField>
        )}

        <FormField label="태그" hint="Enter 또는 콤마로 추가. ↑/↓ 로 기존 태그 선택, Backspace 로 마지막 칩 제거.">
          <TagSuggestionInput
            value={form.tags}
            onChange={(v) => set('tags', v)}
            suggestions={availableTags}
            placeholder="API, 설계, 문서"
          />
        </FormField>

        <div className="flex gap-2 justify-end pt-3 border-t border-default">
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>취소</Button>
          <Button variant="primary" onClick={handleSubmit} leadingIcon={<Save size={16} />}>저장</Button>
        </div>
      </Card>
    </div>
  );
}

function FilePreview({ projectId, item }: { projectId: number; item: DevInfoItem }) {
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
        .catch(() => setError('미리보기를 불러올 수 없습니다.'));
    }
  }, [projectId, item.id, item.filePath, ext, item.updatedAt]);

  if (!item.filePath) return <p className="text-sm text-muted">파일 경로가 없습니다.</p>;

  if (imageExts.includes(ext)) {
    if (imgError) {
      return (
        <p className="text-sm text-on-danger">
          이미지를 불러올 수 없습니다. 파일 경로를 확인하세요: {item.filePath}
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
    if (text === null) return <p className="text-sm text-muted">불러오는 중...</p>;
    if (ext === 'md') {
      return (
        <div className="markdown-body text-secondary">
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
  const { projectId } = useParams<{ projectId: string }>();
  const pid = parseInt(projectId!);
  const [items, setItems] = useState<DevInfoItem[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DevInfoItem | null>(null);
  const [selected, setSelected] = useState<DevInfoItem | null>(null);
  const [filterType, setFilterType] = useState<DevInfoType | ''>('');
  const [keyword, setKeyword] = useState('');
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const load = () => {
    devInfoApi.getByProject(pid).then(setItems);
    devInfoApi.getDistinctTags(pid).then(setAvailableTags).catch(() => setAvailableTags([]));
  };
  useEffect(() => {
    load();
    projectsApi.getById(pid).then(setProject).catch(() => setProject(null));
  }, [pid]);

  useHighlightFromQuery([items.length]);

  const handleDelete = async (id: number) => {
    if (!await confirmDialog({
      title: '개발 정보 삭제',
      message: '이 개발 정보 항목을 삭제하시겠습니까? 되돌릴 수 없습니다.',
      confirmLabel: '삭제',
      danger: true,
    })) return;
    await devInfoApi.delete(pid, id);
    if (selected?.id === id) setSelected(null);
    load();
  };

  const handleOpenFile = async (item: DevInfoItem) => {
    try {
      const res = await fetch(`/api/projects/${pid}/devinfo/${item.id}/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        toast.error(`파일을 열 수 없습니다.${msg ? ` (${msg})` : ''}`);
      }
    } catch (e) {
      toast.error(`파일 열기 중 오류가 발생했습니다: ${(e as Error).message}`);
    }
  };

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const selectedSet = new Set(selectedTags.map((t) => t.toLowerCase()));
    return items.filter((i) => {
      if (filterType && i.type !== filterType) return false;
      if (selectedSet.size > 0) {
        const itemTags = parseTagTokens(i.tags).map((t) => t.toLowerCase());
        if (!itemTags.some((t) => selectedSet.has(t))) return false;
      }
      if (kw) {
        const hay = `${i.title} ${i.tags ?? ''} ${i.content ?? ''} ${i.url ?? ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [items, filterType, selectedTags, keyword]);

  return (
    <div className="p-6 h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="h-page flex items-center gap-2">
          <Code2 size={18} className="text-muted" />
          개발 정보
        </h1>
        <Button variant="primary" onClick={() => setShowForm(true)} leadingIcon={<Plus size={16} />}>
          정보 추가
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <Button
          variant={!filterType ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setFilterType('')}
        >
          전체
        </Button>
        {(['Markdown', 'File', 'Link'] as DevInfoType[]).map((t) => {
          const Icon = typeIcon[t];
          return (
            <Button
              key={t}
              variant={filterType === t ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setFilterType(t === filterType ? '' : t)}
              leadingIcon={<Icon size={14} />}
            >
              {t}
            </Button>
          );
        })}
        <div className="relative ml-auto w-72">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="제목·태그·본문 검색…"
            className={`${inputClass} pl-7 py-1.5 text-sm`}
          />
        </div>
      </div>

      {availableTags.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-muted shrink-0 mr-1">태그:</span>
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
              초기화
            </Button>
          )}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        <div className="lg:col-span-1 overflow-y-auto space-y-2">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Code2 size={36} />}
              title={items.length === 0 ? '개발 정보가 없습니다.' : '조건에 맞는 항목이 없습니다.'}
              description={items.length === 0
                ? "우측 상단 '정보 추가' 버튼으로 시작해보세요."
                : (filterType || keyword || selectedTags.length > 0) ? '필터·검색어를 조정해 보세요.' : '항목이 없습니다.'}
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
                    <button onClick={() => setEditing(item)} className="p-1 text-muted hover:text-primary transition-colors" title="수정">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="p-1 text-on-danger hover:opacity-80 transition-opacity" title="삭제">
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
              <p className="text-sm">항목을 선택하면 상세 내용이 표시됩니다.</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Badge variant={devInfoTypeBadge[selected.type].variant}>{selected.type}</Badge>
                <h2 className="h-section">{selected.title}</h2>
              </div>

              {selected.type === 'Markdown' && (
                <div className="markdown-body text-secondary">
                  <ReactMarkdown>{selected.content}</ReactMarkdown>
                </div>
              )}

              {selected.type === 'File' && (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted mb-1">파일 경로</p>
                    <p className="text-sm text-secondary font-mono bg-surface-2 px-3 py-2 rounded-md break-all border border-default">
                      {selected.filePath}
                    </p>
                  </div>
                  <FilePreview projectId={pid} item={selected} />
                  <Button variant="secondary" onClick={() => handleOpenFile(selected)} leadingIcon={<Folder size={16} />}>
                    파일 열기
                  </Button>
                </div>
              )}

              {selected.type === 'Link' && (
                <div className="space-y-2">
                  <p className="text-xs text-muted">링크</p>
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

      {showForm && (
        <DevInfoForm
          projectId={pid}
          project={project}
          availableTags={availableTags}
          onSave={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {editing && (
        <DevInfoForm
          projectId={pid}
          project={project}
          initial={editing}
          availableTags={availableTags}
          onSave={() => { setEditing(null); load(); }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
