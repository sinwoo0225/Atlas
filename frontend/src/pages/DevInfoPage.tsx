import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { FileText, Folder, Link as LinkIcon, Plus, Pencil, X, Save, Code2, Upload } from 'lucide-react';
import { devInfoApi } from '../api/devinfo';
import type { DevInfoItem, DevInfoType, Project } from '../types';
import { projectsApi } from '../api/projects';

const typeIcon: Record<DevInfoType, React.ComponentType<{ size?: number; className?: string }>> = {
  Markdown: FileText,
  File: Folder,
  Link: LinkIcon,
};

const typeBg: Record<DevInfoType, string> = {
  Markdown: 'bg-zinc-700/50 text-zinc-200',
  File: 'bg-amber-500/15 text-amber-300',
  Link: 'bg-emerald-500/15 text-emerald-300',
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
  onSave,
  onCancel,
}: {
  projectId: number;
  project: Project | null;
  initial?: DevInfoItem;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    type: initial?.type ?? 'Markdown' as DevInfoType,
    content: initial?.content ?? '',
    filePath: initial?.filePath ?? '',
    url: initial?.url ?? '',
    tags: initial?.tags ?? '',
  });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const inputClass =
    'w-full bg-zinc-800/60 border border-zinc-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-zinc-500';

  const handleSubmit = async () => {
    const payload = { projectId, ...form };
    if (initial) await devInfoApi.update(projectId, initial.id, payload);
    else await devInfoApi.create(payload as any);
    onSave();
  };

  const handleFileChosen = async (file: File) => {
    if (!project?.folderPath) {
      alert('프로젝트 폴더 정보를 알 수 없습니다.');
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
      alert('파일 업로드 실패');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#1f1f1f] rounded-lg p-6 w-full max-w-2xl space-y-4 border border-[#2a2a2a] my-4">
        <h2 className="text-base font-medium text-slate-100">{initial ? '정보 수정' : '개발 정보 추가'}</h2>

        <div>
          <label className="block text-xs text-slate-400 mb-1">제목 *</label>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">타입</label>
          <div className="flex gap-2">
            {(['Markdown', 'File', 'Link'] as DevInfoType[]).map((t) => {
              const Icon = typeIcon[t];
              return (
                <button
                  key={t}
                  onClick={() => set('type', t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    form.type === t
                      ? 'bg-zinc-700 text-white'
                      : 'bg-zinc-800 text-slate-300 hover:bg-zinc-700'
                  }`}
                >
                  <Icon size={14} /> {t}
                </button>
              );
            })}
          </div>
        </div>

        {form.type === 'Markdown' && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">내용 (Markdown)</label>
            <textarea
              value={form.content}
              onChange={(e) => set('content', e.target.value)}
              rows={10}
              className={`${inputClass} resize-none font-mono`}
            />
            <p className="text-xs text-slate-500 mt-1">저장 시 프로젝트 폴더에 [제목].md 파일로 저장됩니다.</p>
          </div>
        )}

        {form.type === 'File' && (
          <div className="space-y-2">
            <label className="block text-xs text-slate-400 mb-1">파일 경로</label>
            <div className="flex gap-2">
              <input
                value={form.filePath}
                onChange={(e) => set('filePath', e.target.value)}
                placeholder="C:\..."
                className={inputClass}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-slate-200 rounded-md text-sm shrink-0 disabled:opacity-50"
              >
                <Upload size={14} /> {uploading ? '업로드 중...' : '파일 찾기'}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileChosen(f);
              }}
            />
          </div>
        )}

        {form.type === 'Link' && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">URL</label>
            <input
              value={form.url}
              onChange={(e) => set('url', e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </div>
        )}

        <div>
          <label className="block text-xs text-slate-400 mb-1">태그 (쉼표 구분)</label>
          <input
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="API, 설계, 문서"
            className={inputClass}
          />
        </div>

        <div className="flex gap-2 justify-end pt-3 border-t border-[#2a2a2a]">
          <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-zinc-800 hover:bg-zinc-700 text-slate-200 transition-colors">
            <X size={14} /> 취소
          </button>
          <button onClick={handleSubmit} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-zinc-700 hover:bg-zinc-600 text-white transition-colors">
            <Save size={14} /> 저장
          </button>
        </div>
      </div>
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

  if (!item.filePath) return <p className="text-sm text-slate-400">파일 경로가 없습니다.</p>;

  if (imageExts.includes(ext)) {
    if (imgError) {
      return (
        <p className="text-sm text-red-400">
          이미지를 불러올 수 없습니다. 파일 경로를 확인하세요: {item.filePath}
        </p>
      );
    }
    // updatedAt을 쿼리에 포함시켜 파일 변경 시 캐시 무효화
    const cacheBust = encodeURIComponent(item.updatedAt || '');
    return (
      <img
        src={`/api/projects/${projectId}/devinfo/${item.id}/preview?t=${cacheBust}`}
        alt={item.title}
        className="max-w-full rounded border border-zinc-700"
        onError={() => setImgError(true)}
      />
    );
  }

  if (textExts.includes(ext)) {
    if (error) return <p className="text-sm text-red-400">{error}</p>;
    if (text === null) return <p className="text-sm text-slate-400">불러오는 중...</p>;
    if (ext === 'md') {
      return (
        <div className="markdown-body text-slate-200">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
      );
    }
    return (
      <pre className="text-xs text-slate-200 bg-[#1a1a1a] border border-zinc-700 rounded-md p-3 overflow-auto whitespace-pre-wrap">
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

  const load = () => devInfoApi.getByProject(pid).then(setItems);
  useEffect(() => {
    load();
    projectsApi.getById(pid).then(setProject).catch(() => setProject(null));
  }, [pid]);

  const handleDelete = async (id: number) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await devInfoApi.delete(pid, id);
    if (selected?.id === id) setSelected(null);
    load();
  };

  const handleOpenFile = async (item: DevInfoItem) => {
    try {
      // POST /open returns 200 OK with empty body; api.post returns undefined on 204 but
      // for empty 200 responses fetch may try to parse JSON and fail.
      // Use raw fetch to avoid JSON parse issues.
      const res = await fetch(`/api/projects/${pid}/devinfo/${item.id}/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        alert(`파일을 열 수 없습니다.${msg ? ` (${msg})` : ''}`);
      }
    } catch (e) {
      alert(`파일 열기 중 오류가 발생했습니다: ${(e as Error).message}`);
    }
  };

  const filtered = filterType ? items.filter((i) => i.type === filterType) : items;

  return (
    <div className="p-6 h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <Code2 size={18} className="text-slate-400" />
          개발 정보
        </h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-md text-sm font-medium transition-colors"
        >
          <Plus size={14} /> 정보 추가
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setFilterType('')}
          className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
            !filterType ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-slate-300 hover:bg-zinc-700'
          }`}
        >
          전체
        </button>
        {(['Markdown', 'File', 'Link'] as DevInfoType[]).map((t) => {
          const Icon = typeIcon[t];
          return (
            <button
              key={t}
              onClick={() => setFilterType(t === filterType ? '' : t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                filterType === t ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-slate-300 hover:bg-zinc-700'
              }`}
            >
              <Icon size={14} /> {t}
            </button>
          );
        })}
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        <div className="lg:col-span-1 overflow-y-auto space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <Code2 size={36} className="mx-auto mb-2 text-slate-600" />
              <p className="text-sm">개발 정보가 없습니다.</p>
            </div>
          ) : filtered.map((item) => {
            const Icon = typeIcon[item.type];
            return (
              <div
                key={item.id}
                className={`bg-[#1f1f1f] border rounded-md p-4 cursor-pointer transition-colors ${
                  selected?.id === item.id ? 'border-zinc-500' : 'border-[#2a2a2a] hover:border-zinc-600'
                }`}
                onClick={() => setSelected(selected?.id === item.id ? null : item)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${typeBg[item.type]}`}>
                        <Icon size={12} /> {item.type}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-100 truncate">{item.title}</p>
                    {item.tags && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.tags.split(',').map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                          <span key={tag} className="text-xs bg-zinc-800 text-slate-400 px-1.5 py-0.5 rounded">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setEditing(item)} className="p-1 text-slate-400 hover:text-slate-200" title="수정">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="p-1 text-red-400 hover:text-red-300" title="삭제">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="lg:col-span-2 bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg p-5 overflow-y-auto">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-slate-500">
              <p className="text-sm">항목을 선택하면 상세 내용이 표시됩니다.</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${typeBg[selected.type]}`}>
                  {selected.type}
                </span>
                <h2 className="text-base font-medium text-slate-100">{selected.title}</h2>
              </div>

              {selected.type === 'Markdown' && (
                <div className="markdown-body text-slate-200">
                  <ReactMarkdown>{selected.content}</ReactMarkdown>
                </div>
              )}

              {selected.type === 'File' && (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">파일 경로</p>
                    <p className="text-sm text-slate-200 font-mono bg-zinc-800/50 px-3 py-2 rounded-md break-all border border-zinc-700">
                      {selected.filePath}
                    </p>
                  </div>
                  <FilePreview projectId={pid} item={selected} />
                  <button
                    onClick={() => handleOpenFile(selected)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-slate-200 rounded-md text-sm transition-colors"
                  >
                    <Folder size={14} /> 파일 열기
                  </button>
                </div>
              )}

              {selected.type === 'Link' && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">링크</p>
                  <a href={selected.url} target="_blank" rel="noreferrer" className="text-sm text-zinc-300 hover:text-white hover:underline break-all">
                    {selected.url}
                  </a>
                  {selected.content && (
                    <div className="mt-4 pt-4 border-t border-[#2a2a2a]">
                      <p className="text-sm text-slate-300 whitespace-pre-wrap">{selected.content}</p>
                    </div>
                  )}
                </div>
              )}

              {selected.tags && (
                <div className="mt-4 pt-4 border-t border-[#2a2a2a] flex flex-wrap gap-1">
                  {selected.tags.split(',').map((t) => t.trim()).filter(Boolean).map((tag) => (
                    <span key={tag} className="text-xs bg-zinc-800 text-slate-300 px-2 py-1 rounded">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <DevInfoForm
          projectId={pid}
          project={project}
          onSave={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {editing && (
        <DevInfoForm
          projectId={pid}
          project={project}
          initial={editing}
          onSave={() => { setEditing(null); load(); }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
