import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Eye, X, Save, ClipboardList, Flag, ChevronRight, CornerDownRight } from 'lucide-react';
import { Button, Card, Modal, Badge, EmptyState, FormField, inputClass } from '../components/ui';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { wbsTemplatesApi } from '../api/wbsTemplates';
import type { WbsTemplate, WbsTemplateSummary, WbsTemplateNode } from '../types';

const importanceOptions = [
  { value: 1, label: '낮음' },
  { value: 2, label: '중간' },
  { value: 3, label: '높음' },
];

function blankNode(): WbsTemplateNode {
  return { name: '', assignee: '', offsetStartDays: null, durationDays: null, isMilestone: false, importance: 2, notes: '', children: [] };
}

// 빈 문자열 → null, 숫자 → number. 음수/소수는 막고 정수만.
function parseNum(v: string): number | null {
  if (v.trim() === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

function NodeEditor({
  node,
  depth,
  readOnly,
  onChange,
  onRemove,
}: {
  node: WbsTemplateNode;
  depth: number;
  readOnly: boolean;
  onChange: (next: WbsTemplateNode) => void;
  onRemove: () => void;
}) {
  const update = (patch: Partial<WbsTemplateNode>) => onChange({ ...node, ...patch });
  const addChild = () => update({ children: [...node.children, blankNode()] });
  const updateChild = (i: number, child: WbsTemplateNode) =>
    update({ children: node.children.map((c, idx) => (idx === i ? child : c)) });
  const removeChild = (i: number) =>
    update({ children: node.children.filter((_, idx) => idx !== i) });

  return (
    <div>
      <div className="flex items-center gap-2 py-1" style={{ paddingLeft: depth * 20 }}>
        {depth > 0 && <CornerDownRight size={14} className="text-muted shrink-0" />}
        <input
          value={node.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="작업 이름"
          disabled={readOnly}
          className={`${inputClass} flex-1`}
        />
        <input
          value={node.assignee}
          onChange={(e) => update({ assignee: e.target.value })}
          placeholder="담당(역할)"
          disabled={readOnly}
          className={`${inputClass} w-28`}
        />
        <input
          type="number"
          value={node.offsetStartDays ?? ''}
          onChange={(e) => update({ offsetStartDays: parseNum(e.target.value) })}
          placeholder="시작+일"
          title="시작 오프셋(앵커로부터 일수). 비우면 날짜 없음"
          disabled={readOnly}
          className={`${inputClass} w-20`}
        />
        <input
          type="number"
          value={node.durationDays ?? ''}
          onChange={(e) => update({ durationDays: parseNum(e.target.value) })}
          placeholder="기간"
          title="기간(일). 비우면 종료일 없음"
          disabled={readOnly || node.isMilestone}
          className={`${inputClass} w-16`}
        />
        <select
          value={node.importance}
          onChange={(e) => update({ importance: Number(e.target.value) })}
          disabled={readOnly}
          className={`${inputClass} w-20`}
        >
          {importanceOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => update({ isMilestone: !node.isMilestone })}
          disabled={readOnly}
          title="마일스톤"
          className={`p-1.5 rounded shrink-0 transition-colors disabled:opacity-50 ${node.isMilestone ? 'text-accent bg-accent-soft' : 'text-muted hover:text-secondary'}`}
        >
          <Flag size={14} />
        </button>
        {!readOnly && (
          <>
            <button type="button" onClick={addChild} title="하위 작업 추가" className="p-1.5 rounded text-muted hover:text-secondary shrink-0">
              <Plus size={14} />
            </button>
            <button type="button" onClick={onRemove} title="삭제" className="p-1.5 rounded text-muted hover:text-on-danger shrink-0">
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
      {node.children.map((c, i) => (
        <NodeEditor
          key={i}
          node={c}
          depth={depth + 1}
          readOnly={readOnly}
          onChange={(nc) => updateChild(i, nc)}
          onRemove={() => removeChild(i)}
        />
      ))}
    </div>
  );
}

interface EditorState {
  mode: 'create' | 'edit' | 'view';
  id: number | null;
  updatedAt: string | null;
  name: string;
  description: string;
  category: string;
  nodes: WbsTemplateNode[];
}

function TemplateEditor({ initial, onClose, onSaved }: {
  initial: EditorState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [category, setCategory] = useState(initial.category);
  const [nodes, setNodes] = useState<WbsTemplateNode[]>(initial.nodes);
  const [saving, setSaving] = useState(false);
  const readOnly = initial.mode === 'view';

  const snapshot = JSON.stringify({ name, description, category, nodes });
  const dirty = !readOnly && snapshot !== JSON.stringify({ name: initial.name, description: initial.description, category: initial.category, nodes: initial.nodes });

  const addRoot = () => setNodes((ns) => [...ns, blankNode()]);
  const updateRoot = (i: number, node: WbsTemplateNode) => setNodes((ns) => ns.map((n, idx) => (idx === i ? node : n)));
  const removeRoot = (i: number) => setNodes((ns) => ns.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!name.trim()) { toast.error('템플릿 이름을 입력하세요.'); return; }
    setSaving(true);
    try {
      if (initial.mode === 'create') {
        await wbsTemplatesApi.create({ name: name.trim(), description, category, nodes });
        toast.success('템플릿을 만들었어요.');
      } else if (initial.mode === 'edit' && initial.id != null && initial.updatedAt) {
        await wbsTemplatesApi.update(initial.id, { name: name.trim(), description, category, nodes, updatedAt: initial.updatedAt });
        toast.success('템플릿을 수정했어요.');
      }
      onSaved();
    } catch {
      /* client.ts 가 토스트 처리 */
    } finally {
      setSaving(false);
    }
  };

  const titles = { create: '새 일정 템플릿', edit: '템플릿 수정', view: '템플릿 보기' };

  return (
    <Modal
      open
      onClose={onClose}
      title={titles[initial.mode]}
      size="xxl"
      fixedHeight
      dirty={dirty}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} leadingIcon={<X size={16} />}>
            {readOnly ? '닫기' : '취소'}
          </Button>
          {!readOnly && (
            <Button variant="primary" onClick={handleSave} leadingIcon={<Save size={16} />} disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </Button>
          )}
        </>
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FormField label="템플릿 이름" required>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} className={inputClass} />
          </FormField>
          <FormField label="분류">
            <input value={category} onChange={(e) => setCategory(e.target.value)} disabled={readOnly} className={inputClass} placeholder="예: 개발, 운영" />
          </FormField>
          <FormField label="설명">
            <input value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} className={inputClass} />
          </FormField>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-secondary">작업 트리</h3>
            {!readOnly && (
              <Button variant="secondary" size="sm" onClick={addRoot} leadingIcon={<Plus size={14} />}>
                상위 작업 추가
              </Button>
            )}
          </div>
          <p className="text-xs text-muted mb-2">
            시작+일/기간을 비우면 날짜 없는 구조 템플릿이 됩니다. 적용 시 프로젝트 시작일 기준으로 날짜가 계산돼요.
          </p>
          {nodes.length === 0 ? (
            <EmptyState
              icon={<ChevronRight size={28} />}
              title="작업이 없습니다."
              description={readOnly ? undefined : '상위 작업을 추가해 트리를 구성하세요.'}
            />
          ) : (
            <div className="border border-default rounded-md p-2">
              {nodes.map((n, i) => (
                <NodeEditor
                  key={i}
                  node={n}
                  depth={0}
                  readOnly={readOnly}
                  onChange={(nn) => updateRoot(i, nn)}
                  onRemove={() => removeRoot(i)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function WbsTemplatesPage() {
  const [list, setList] = useState<WbsTemplateSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const load = () => {
    setError(null);
    wbsTemplatesApi.list().then(setList).catch(setError);
  };
  useEffect(load, []);

  const toEditorState = (full: WbsTemplate, mode: EditorState['mode']): EditorState => ({
    mode,
    id: full.id,
    updatedAt: full.updatedAt,
    name: full.name,
    description: full.description,
    category: full.category,
    nodes: full.nodes,
  });

  const openCreate = () =>
    setEditor({ mode: 'create', id: null, updatedAt: null, name: '', description: '', category: '', nodes: [] });

  const openEdit = async (s: WbsTemplateSummary) => {
    if (s.id == null) return;
    try { setEditor(toEditorState(await wbsTemplatesApi.get(s.id), 'edit')); }
    catch { /* 토스트 처리됨 */ }
  };

  const openView = async (s: WbsTemplateSummary) => {
    try {
      const full = s.isBuiltIn && s.builtinKey
        ? await wbsTemplatesApi.getBuiltin(s.builtinKey)
        : await wbsTemplatesApi.get(s.id!);
      setEditor(toEditorState(full, 'view'));
    } catch { /* 토스트 처리됨 */ }
  };

  const handleDelete = async (s: WbsTemplateSummary) => {
    if (s.id == null) return;
    if (!await confirmDialog({
      title: '템플릿 삭제',
      message: `'${s.name}' 템플릿을 삭제하시겠습니까?`,
      confirmLabel: '삭제',
      danger: true,
    })) return;
    try {
      await wbsTemplatesApi.delete(s.id);
      toast.success('템플릿을 삭제했어요.');
      load();
    } catch { /* 토스트 처리됨 */ }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="h-page">일정 템플릿</h1>
          <p className="text-sm text-muted mt-1">새 프로젝트의 WBS를 빠르게 구성할 수 있는 재사용 템플릿이에요.</p>
        </div>
        <Button variant="primary" onClick={openCreate} leadingIcon={<Plus size={16} />}>
          새 템플릿
        </Button>
      </div>

      {error != null && <EmptyState error={error} onRetry={load} />}

      {list && list.length === 0 && (
        <EmptyState
          icon={<ClipboardList size={40} />}
          title="템플릿이 없습니다."
          description="새 템플릿을 만들어보세요. 또는 WBS 화면에서 '현재 WBS를 템플릿으로 저장'을 사용할 수 있어요."
        />
      )}

      {list && list.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((t) => (
            <Card key={t.isBuiltIn ? `b:${t.builtinKey}` : `c:${t.id}`} className="flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-primary truncate">{t.name}</div>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  {t.category && <Badge size="sm" variant="neutral">{t.category}</Badge>}
                  {t.isBuiltIn && <Badge size="sm" variant="info">기본</Badge>}
                </div>
              </div>
              {t.description && <p className="text-sm text-muted line-clamp-2 mb-2">{t.description}</p>}
              <div className="flex items-center justify-between mt-auto pt-2">
                <span className="text-xs text-muted">작업 {t.nodeCount}개</span>
                <div className="flex items-center gap-1">
                  {t.isBuiltIn ? (
                    <Button variant="ghost" size="sm" onClick={() => openView(t)} leadingIcon={<Eye size={14} />}>
                      보기
                    </Button>
                  ) : (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)} leadingIcon={<Pencil size={14} />}>
                        편집
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(t)} leadingIcon={<Trash2 size={14} />}>
                        삭제
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editor && (
        <TemplateEditor
          initial={editor}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); load(); }}
        />
      )}
    </div>
  );
}
