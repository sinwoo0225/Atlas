import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';

interface Shortcut {
  keys: string[];
  desc: string;
}

const SHORTCUTS: { group: string; items: Shortcut[] }[] = [
  {
    group: '전역',
    items: [
      { keys: ['Ctrl', 'K'], desc: '검색 팔레트 열기' },
      { keys: ['Ctrl', 'B'], desc: '사이드바 접기/펼치기' },
      { keys: ['?'], desc: '이 도움말 열기' },
      { keys: ['Esc'], desc: '열린 모달/팔레트 닫기' },
    ],
  },
  {
    group: '모달',
    items: [
      { keys: ['Tab'], desc: '모달 안 다음 요소로 이동' },
      { keys: ['Shift', 'Tab'], desc: '모달 안 이전 요소로 이동' },
      { keys: ['Esc'], desc: '닫기 (변경사항 있으면 확인)' },
    ],
  },
  {
    group: '이슈 페이지',
    items: [
      { keys: ['Enter'], desc: '마지막 빈 행에서 이슈 추가' },
    ],
  },
];

export function ShortcutsModal() {
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
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="키보드 단축키" size="md" showCloseButton>
      <div className="space-y-4">
        {SHORTCUTS.map((group) => (
          <div key={group.group}>
            <h3 className="text-xs text-muted font-medium uppercase tracking-wider mb-2">{group.group}</h3>
            <ul className="space-y-1.5">
              {group.items.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-secondary">{s.desc}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
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
