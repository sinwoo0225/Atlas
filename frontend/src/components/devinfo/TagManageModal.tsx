import { useMemo, useState } from 'react';
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
  const [tab, setTab] = useState<Tab>('rename');
  const sorted = useMemo(() => [...tags].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })), [tags]);

  return (
    <Modal open={open} onClose={onClose} title="태그 관리" size="md" showCloseButton>
      <div className="flex flex-col gap-4">
        <div className="flex gap-1 border-b border-default">
          {([
            { value: 'rename' as Tab, label: '이름 변경' },
            { value: 'merge' as Tab, label: '병합' },
          ]).map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`px-3 py-1.5 text-sm transition-colors border-b-2 -mb-px ${
                tab === t.value
                  ? 'border-accent text-primary'
                  : 'border-transparent text-muted hover:text-secondary'
              }`}
            >
              {t.label}
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
  const [oldName, setOldName] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!oldName || !newName.trim()) return;
    setBusy(true);
    try {
      const { changed } = await devInfoApi.renameTag(projectId, oldName, newName.trim());
      toast.success(`${changed} 개 항목의 '${oldName}' → '${newName.trim()}'`);
      onChanged();
    } catch { /* api/client.ts */ }
    finally { setBusy(false); }
  };

  if (tags.length === 0) {
    return <p className="text-sm text-muted italic">등록된 태그가 없어요.</p>;
  }

  return (
    <div className="space-y-3">
      <FormField label="바꿀 태그">
        <select value={oldName} onChange={(e) => setOldName(e.target.value)} className={inputClass}>
          <option value="">— 선택 —</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </FormField>
      <FormField label="새 이름">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="새 태그 이름"
          className={inputClass}
        />
      </FormField>
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={submit} disabled={busy || !oldName || !newName.trim()}>
          변경
        </Button>
      </div>
    </div>
  );
}

function MergeTab({ projectId, tags, onChanged }: { projectId: number; tags: string[]; onChanged: () => void }) {
  const [sources, setSources] = useState<string[]>([]);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);

  const toggleSource = (t: string) => {
    setSources((prev) => prev.includes(t) ? prev.filter((s) => s !== t) : [...prev, t]);
  };

  const submit = async () => {
    if (sources.length === 0 || !target.trim()) return;
    setBusy(true);
    try {
      const { changed } = await devInfoApi.mergeTags(projectId, sources, target.trim());
      toast.success(`${changed} 개 항목 병합됨 → '${target.trim()}'`);
      onChanged();
    } catch { /* api/client.ts */ }
    finally { setBusy(false); }
  };

  if (tags.length === 0) {
    return <p className="text-sm text-muted italic">등록된 태그가 없어요.</p>;
  }

  return (
    <div className="space-y-3">
      <FormField label="병합할 태그 (여러 개 선택)">
        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2 bg-surface-2 border border-default rounded-md">
          {tags.map((t) => {
            const active = sources.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleSource(t)}
                className={`text-xs px-2 py-1 rounded border transition-colors ${
                  active
                    ? 'bg-accent-soft border-accent text-accent'
                    : 'bg-surface border-default text-secondary hover:border-strong'
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </FormField>
      <FormField label="합칠 대상 이름">
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="대상 태그 이름 (신규 또는 기존)"
          list="merge-target-suggestions"
          className={inputClass}
        />
        <datalist id="merge-target-suggestions">
          {tags.map((t) => <option key={t} value={t} />)}
        </datalist>
      </FormField>
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={submit} disabled={busy || sources.length === 0 || !target.trim()}>
          병합
        </Button>
      </div>
    </div>
  );
}
