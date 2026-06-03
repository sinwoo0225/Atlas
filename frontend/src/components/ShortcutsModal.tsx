import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './ui/Modal';
import { SHORTCUT_REGISTRY, SHORTCUTS_OPEN_EVENT } from '../data/shortcuts';

export function ShortcutsModal() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ? — Shift+/ 또는 직접 ?. input/textarea/select 안에서는 무시.
      if (e.key !== '?') return;
      const t = e.target as HTMLElement;
      const tag = t?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return;
      e.preventDefault();
      setOpen(true);
    };
    const onCustomOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(SHORTCUTS_OPEN_EVENT, onCustomOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(SHORTCUTS_OPEN_EVENT, onCustomOpen);
    };
  }, []);

  return (
    <Modal open={open} onClose={() => setOpen(false)} title={t('shortcutsTitle')} size="md" showCloseButton>
      <div className="space-y-4">
        {SHORTCUT_REGISTRY.map((group) => (
          <div key={group.groupKey}>
            <h3 className="text-xs text-muted font-medium uppercase tracking-wider mb-2">{t(group.groupKey)}</h3>
            <ul className="space-y-1.5">
              {group.items.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-secondary">{t(s.descKey)}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    {s.keys.map((k, ki) => (
                      <kbd
                        key={ki}
                        className="text-[11px] px-1.5 py-0.5 rounded border border-default bg-surface-2 text-secondary font-mono"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
