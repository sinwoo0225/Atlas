import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { Modal, Button, FormField, inputClass } from '../ui';
import { confirmDialog } from '../ui/ConfirmDialog';
import type { IssueCustomColumn, IssueCustomColumnType } from '../../types';

interface Props {
  open: boolean;
  columns: IssueCustomColumn[];
  onClose: () => void;
  addColumn: (name: string, type: IssueCustomColumnType) => void;
  renameColumn: (key: string, name: string) => void;
  removeColumn: (key: string) => void;
  moveColumn: (key: string, dir: 'up' | 'down') => void;
}

type Tab = 'add' | 'manage';
const TYPES: IssueCustomColumnType[] = ['text', 'date', 'number'];

export function IssueColumnsModal({ open, columns, onClose, addColumn, renameColumn, removeColumn, moveColumn }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('add');

  return (
    <Modal open={open} onClose={onClose} title={t('issues:columns.manage')} size="md" showCloseButton>
      <div className="flex flex-col gap-4">
        <div className="flex gap-1 border-b border-default">
          {([
            { value: 'add' as Tab, label: t('issues:columns.addTab') },
            { value: 'manage' as Tab, label: t('issues:columns.manageTab') },
          ]).map((tb) => (
            <button
              key={tb.value}
              type="button"
              onClick={() => setTab(tb.value)}
              className={`px-3 py-1.5 text-sm transition-colors border-b-2 -mb-px ${
                tab === tb.value
                  ? 'border-accent text-primary'
                  : 'border-transparent text-muted hover:text-secondary'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>
        {tab === 'add'
          ? <AddTab columns={columns} onAdd={(n, ty) => { addColumn(n, ty); setTab('manage'); }} />
          : <ManageTab columns={columns} renameColumn={renameColumn} removeColumn={removeColumn} moveColumn={moveColumn} />}
      </div>
    </Modal>
  );
}

function AddTab({ columns, onAdd }: { columns: IssueCustomColumn[]; onAdd: (name: string, type: IssueCustomColumnType) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [type, setType] = useState<IssueCustomColumnType>('text');

  const trimmed = name.trim();
  const duplicate = trimmed.length > 0 && columns.some((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  const canAdd = trimmed.length > 0 && !duplicate;

  const submit = () => {
    if (!canAdd) return;
    onAdd(trimmed, type);
    setName('');
    setType('text');
  };

  return (
    <div className="space-y-3">
      <FormField label={t('issues:columns.nameLabel')}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder={t('issues:columns.namePlaceholder')}
          className={inputClass}
          autoFocus
        />
      </FormField>
      {duplicate && <p className="text-xs text-on-danger">{t('issues:columns.duplicateName')}</p>}
      <FormField label={t('issues:columns.typeLabel')}>
        <select value={type} onChange={(e) => setType(e.target.value as IssueCustomColumnType)} className={inputClass}>
          {TYPES.map((ty) => <option key={ty} value={ty}>{t(`issues:columns.type.${ty}`)}</option>)}
        </select>
      </FormField>
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={submit} disabled={!canAdd} leadingIcon={<Plus size={14} />}>
          {t('issues:columns.addBtn')}
        </Button>
      </div>
    </div>
  );
}

function ManageTab({ columns, renameColumn, removeColumn, moveColumn }: {
  columns: IssueCustomColumn[];
  renameColumn: (key: string, name: string) => void;
  removeColumn: (key: string) => void;
  moveColumn: (key: string, dir: 'up' | 'down') => void;
}) {
  const { t } = useTranslation();
  if (columns.length === 0) {
    return <p className="text-sm text-muted italic">{t('issues:columns.empty')}</p>;
  }
  return (
    <ul className="space-y-1.5">
      {columns.map((col, i) => (
        <ManageRow
          key={col.key}
          col={col}
          isFirst={i === 0}
          isLast={i === columns.length - 1}
          onRename={(name) => renameColumn(col.key, name)}
          onRemove={async () => {
            if (await confirmDialog({
              title: t('issues:columns.delete'),
              message: t('issues:columns.deleteConfirm', { name: col.name }),
              confirmLabel: t('common:delete'),
              danger: true,
            })) removeColumn(col.key);
          }}
          onMove={(dir) => moveColumn(col.key, dir)}
        />
      ))}
    </ul>
  );
}

function ManageRow({ col, isFirst, isLast, onRename, onRemove, onMove }: {
  col: IssueCustomColumn;
  isFirst: boolean;
  isLast: boolean;
  onRename: (name: string) => void;
  onRemove: () => void;
  onMove: (dir: 'up' | 'down') => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(col.name);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== col.name) onRename(next);
    else setDraft(col.name);
  };

  return (
    <li className="flex items-center gap-2 bg-surface-2 border border-default rounded px-2 py-1.5">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="flex-1 min-w-0 bg-transparent text-sm text-primary border border-transparent rounded px-1.5 py-0.5 hover:border-default focus:border-default focus:outline-none transition-colors"
        title={t('issues:columns.rename')}
      />
      <span className="text-xs text-muted shrink-0">{t(`issues:columns.type.${col.type}`)}</span>
      <button type="button" onClick={() => onMove('up')} disabled={isFirst}
        className="p-0.5 text-muted hover:text-primary disabled:opacity-30 transition-colors" title={t('issues:columns.moveUp')}>
        <ChevronUp size={14} />
      </button>
      <button type="button" onClick={() => onMove('down')} disabled={isLast}
        className="p-0.5 text-muted hover:text-primary disabled:opacity-30 transition-colors" title={t('issues:columns.moveDown')}>
        <ChevronDown size={14} />
      </button>
      <button type="button" onClick={onRemove}
        className="p-0.5 text-on-danger hover:opacity-80 transition-opacity" title={t('issues:columns.delete')}>
        <X size={14} />
      </button>
    </li>
  );
}
