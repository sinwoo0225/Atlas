import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Eye, X, Save, ClipboardList, Flag, ChevronRight, CornerDownRight } from 'lucide-react';
import { Button, Card, Modal, Badge, EmptyState, FormField, inputClass } from '../components/ui';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { wbsTemplatesApi } from '../api/wbsTemplates';
import type { WbsTemplate, WbsTemplateSummary, WbsTemplateNode } from '../types';

const importanceOptions = [
  { value: 1, labelKey: 'status:importance.Low' },
  { value: 2, labelKey: 'status:importance.Medium' },
  { value: 3, labelKey: 'status:importance.High' },
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
  const { t } = useTranslation();
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
          placeholder={t('templates:node.name')}
          disabled={readOnly}
          className={`${inputClass} flex-1`}
        />
        <input
          value={node.assignee}
          onChange={(e) => update({ assignee: e.target.value })}
          placeholder={t('templates:node.assignee')}
          disabled={readOnly}
          className={`${inputClass} w-28`}
        />
        <input
          type="number"
          value={node.offsetStartDays ?? ''}
          onChange={(e) => update({ offsetStartDays: parseNum(e.target.value) })}
          placeholder={t('templates:node.offsetStart')}
          title={t('templates:node.offsetTitle')}
          disabled={readOnly}
          className={`${inputClass} w-20`}
        />
        <input
          type="number"
          value={node.durationDays ?? ''}
          onChange={(e) => update({ durationDays: parseNum(e.target.value) })}
          placeholder={t('templates:node.duration')}
          title={t('templates:node.durationTitle')}
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
            <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => update({ isMilestone: !node.isMilestone })}
          disabled={readOnly}
          title={t('templates:node.milestone')}
          className={`p-1.5 rounded shrink-0 transition-colors disabled:opacity-50 ${node.isMilestone ? 'text-accent bg-accent-soft' : 'text-muted hover:text-secondary'}`}
        >
          <Flag size={14} />
        </button>
        {!readOnly && (
          <>
            <button type="button" onClick={addChild} title={t('templates:node.addChild')} className="p-1.5 rounded text-muted hover:text-secondary shrink-0">
              <Plus size={14} />
            </button>
            <button type="button" onClick={onRemove} title={t('templates:node.remove')} className="p-1.5 rounded text-muted hover:text-on-danger shrink-0">
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
  const { t } = useTranslation();
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
    if (!name.trim()) { toast.error(t('templates:editor.nameRequired')); return; }
    setSaving(true);
    try {
      if (initial.mode === 'create') {
        await wbsTemplatesApi.create({ name: name.trim(), description, category, nodes });
        toast.success(t('templates:editor.created'));
      } else if (initial.mode === 'edit' && initial.id != null && initial.updatedAt) {
        await wbsTemplatesApi.update(initial.id, { name: name.trim(), description, category, nodes, updatedAt: initial.updatedAt });
        toast.success(t('templates:editor.updated'));
      }
      onSaved();
    } catch {
      /* client.ts 가 토스트 처리 */
    } finally {
      setSaving(false);
    }
  };

  const titles = { create: t('templates:editor.createTitle'), edit: t('templates:editor.editTitle'), view: t('templates:editor.viewTitle') };

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
            {readOnly ? t('common:close') : t('common:cancel')}
          </Button>
          {!readOnly && (
            <Button variant="primary" onClick={handleSave} leadingIcon={<Save size={16} />} disabled={saving}>
              {saving ? t('templates:editor.saving') : t('common:save')}
            </Button>
          )}
        </>
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FormField label={t('templates:editor.name')} required>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} className={inputClass} />
          </FormField>
          <FormField label={t('templates:editor.category')}>
            <input value={category} onChange={(e) => setCategory(e.target.value)} disabled={readOnly} className={inputClass} placeholder={t('templates:editor.categoryPlaceholder')} />
          </FormField>
          <FormField label={t('templates:editor.description')}>
            <input value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} className={inputClass} />
          </FormField>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-secondary">{t('templates:editor.tree')}</h3>
            {!readOnly && (
              <Button variant="secondary" size="sm" onClick={addRoot} leadingIcon={<Plus size={14} />}>
                {t('templates:editor.addRoot')}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted mb-2">
            {t('templates:editor.treeHint')}
          </p>
          {nodes.length === 0 ? (
            <EmptyState
              icon={<ChevronRight size={28} />}
              title={t('templates:editor.emptyTitle')}
              description={readOnly ? undefined : t('templates:editor.emptyDesc')}
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
  const { t } = useTranslation();
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
      title: t('templates:deleteTitle'),
      message: t('templates:deleteMessage', { name: s.name }),
      confirmLabel: t('common:delete'),
      danger: true,
    })) return;
    try {
      await wbsTemplatesApi.delete(s.id);
      toast.success(t('templates:deleted'));
      load();
    } catch { /* 토스트 처리됨 */ }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="h-page">{t('templates:title')}</h1>
          <p className="text-sm text-muted mt-1">{t('templates:subtitle')}</p>
        </div>
        <Button variant="primary" onClick={openCreate} leadingIcon={<Plus size={16} />}>
          {t('templates:new')}
        </Button>
      </div>

      {error != null && <EmptyState error={error} onRetry={load} />}

      {list && list.length === 0 && (
        <EmptyState
          icon={<ClipboardList size={40} />}
          title={t('templates:emptyTitle')}
          description={t('templates:emptyDesc')}
        />
      )}

      {list && list.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((tpl) => (
            <Card key={tpl.isBuiltIn ? `b:${tpl.builtinKey}` : `c:${tpl.id}`} className="flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-primary truncate">{tpl.name}</div>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  {tpl.category && <Badge size="sm" variant="neutral">{tpl.category}</Badge>}
                  {tpl.isBuiltIn && <Badge size="sm" variant="info">{t('templates:builtin')}</Badge>}
                </div>
              </div>
              {tpl.description && <p className="text-sm text-muted line-clamp-2 mb-2">{tpl.description}</p>}
              <div className="flex items-center justify-between mt-auto pt-2">
                <span className="text-xs text-muted">{t('templates:nodeCount', { count: tpl.nodeCount })}</span>
                <div className="flex items-center gap-1">
                  {tpl.isBuiltIn ? (
                    <Button variant="ghost" size="sm" onClick={() => openView(tpl)} leadingIcon={<Eye size={14} />}>
                      {t('templates:view')}
                    </Button>
                  ) : (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(tpl)} leadingIcon={<Pencil size={14} />}>
                        {t('templates:edit')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(tpl)} leadingIcon={<Trash2 size={14} />}>
                        {t('common:delete')}
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
