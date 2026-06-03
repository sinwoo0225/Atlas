import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Modal, Button, FormField, inputClass } from '../ui';
import { devInfoApi } from '../../api/devinfo';

interface Props {
  open: boolean;
  projectId: number;
  tags: string[];
  onClose: () => void;
  onChanged: () => void;
}

type Tab = 'rename' | 'merge';

export function TagManageModal({ open, projectId, tags, onClose, onChanged }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('rename');
  const sorted = useMemo(() => [...tags].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })), [tags]);

  return (
    <Modal open={open} onClose={onClose} title={t('devinfo:tagManage.title')} size="md" showCloseButton>
      <div className="flex flex-col gap-4">
        <div className="flex gap-1 border-b border-default">
          {([
            { value: 'rename' as Tab, labelKey: 'devinfo:tagManage.rename' },
            { value: 'merge' as Tab, labelKey: 'devinfo:tagManage.merge' },
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
              {t(tb.labelKey)}
            </button>
          ))}
        </div>
        {tab === 'rename' ? (
          <RenameTab projectId={projectId} tags={sorted} onChanged={() => { onChanged(); onClose(); }} />
        ) : (
          <MergeTab projectId={projectId} tags={sorted} onChanged={() => { onChanged(); onClose(); }} />
        )}
      </div>
    </Modal>
  );
}

function RenameTab({ projectId, tags, onChanged }: { projectId: number; tags: string[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [oldName, setOldName] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!oldName || !newName.trim()) return;
    setBusy(true);
    try {
      const { changed } = await devInfoApi.renameTag(projectId, oldName, newName.trim());
      toast.success(t('devinfo:tagManage.renamed', { count: changed, from: oldName, to: newName.trim() }));
      onChanged();
    } catch { /* api/client.ts */ }
    finally { setBusy(false); }
  };

  if (tags.length === 0) {
    return <p className="text-sm text-muted italic">{t('devinfo:tagManage.noTags')}</p>;
  }

  return (
    <div className="space-y-3">
      <FormField label={t('devinfo:tagManage.oldTag')}>
        <select value={oldName} onChange={(e) => setOldName(e.target.value)} className={inputClass}>
          <option value="">{t('devinfo:tagManage.selectPlaceholder')}</option>
          {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
        </select>
      </FormField>
      <FormField label={t('devinfo:tagManage.newName')}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('devinfo:tagManage.newNamePlaceholder')}
          className={inputClass}
        />
      </FormField>
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={submit} disabled={busy || !oldName || !newName.trim()}>
          {t('devinfo:tagManage.renameBtn')}
        </Button>
      </div>
    </div>
  );
}

function MergeTab({ projectId, tags, onChanged }: { projectId: number; tags: string[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [sources, setSources] = useState<string[]>([]);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);

  const toggleSource = (tag: string) => {
    setSources((prev) => prev.includes(tag) ? prev.filter((s) => s !== tag) : [...prev, tag]);
  };

  const submit = async () => {
    if (sources.length === 0 || !target.trim()) return;
    setBusy(true);
    try {
      const { changed } = await devInfoApi.mergeTags(projectId, sources, target.trim());
      toast.success(t('devinfo:tagManage.merged', { count: changed, to: target.trim() }));
      onChanged();
    } catch { /* api/client.ts */ }
    finally { setBusy(false); }
  };

  if (tags.length === 0) {
    return <p className="text-sm text-muted italic">{t('devinfo:tagManage.noTags')}</p>;
  }

  return (
    <div className="space-y-3">
      <FormField label={t('devinfo:tagManage.mergeSources')}>
        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2 bg-surface-2 border border-default rounded-md">
          {tags.map((tag) => {
            const active = sources.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleSource(tag)}
                className={`text-xs px-2 py-1 rounded border transition-colors ${
                  active
                    ? 'bg-accent-soft border-accent text-accent'
                    : 'bg-surface border-default text-secondary hover:border-strong'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </FormField>
      <FormField label={t('devinfo:tagManage.mergeTarget')}>
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={t('devinfo:tagManage.mergeTargetPlaceholder')}
          list="merge-target-suggestions"
          className={inputClass}
        />
        <datalist id="merge-target-suggestions">
          {tags.map((tag) => <option key={tag} value={tag} />)}
        </datalist>
      </FormField>
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={submit} disabled={busy || sources.length === 0 || !target.trim()}>
          {t('devinfo:tagManage.mergeBtn')}
        </Button>
      </div>
    </div>
  );
}
