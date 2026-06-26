import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import type { WbsItem } from '../types';
import { collectAncestorIds, collectMatchedIds, type WbsFilterOpts } from '../utils/wbsHelpers';
import { inputClass } from './ui';

type Props = {
  items: WbsItem[];                       // 전체 트리 (children 포함)
  selectedId: number | null;              // null = "(루트)"
  excludeIds: Set<number>;                // 자기 자신 + 모든 자손 (순환 가드)
  onSelect: (id: number | null) => void;
  showRoot?: boolean;                     // "(루트)" 옵션 표시. 부모 선택용 true, 링크 추가용 false.
};

// WBS 트리에서 부모를 고르는 picker. 검색 + expand/collapse + 자손 비활성.
// 높이는 부모가 제어 (flex 컨테이너 안에서 flex-1 로 fit). 자체 max-h 없음 — 이중 스크롤 방지.
export function WbsTreePicker({ items, selectedId, excludeIds, onSelect, showRoot = true }: Props) {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState('');
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<number>>(new Set());

  const filterOpts: WbsFilterOpts = useMemo(() => ({
    kw: keyword.trim().toLowerCase(),
    unassigned: false,
    late: false,
    overdueStart: false,
    statuses: new Set(),
    assignees: new Set(),
    todayMs: 0,
  }), [keyword]);

  // 검색어 있을 때 매칭 노드 + 모든 조상을 자동 expand. 사용자가 토글한 노드는 그대로 존중.
  const autoExpanded = useMemo(() => {
    if (!filterOpts.kw) return new Set<number>();
    const matched = collectMatchedIds(items, filterOpts);
    const out = new Set<number>(matched);
    matched.forEach((id) => collectAncestorIds(id, items).forEach((a) => out.add(a)));
    return out;
  }, [items, filterOpts]);

  const isExpanded = (id: number) => manuallyExpanded.has(id) || autoExpanded.has(id);
  const toggle = (id: number) => {
    setManuallyExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 검색어 있으면 매칭/조상만 노출. 없으면 전부.
  const visible = filterOpts.kw ? autoExpanded : null;

  return (
    <div className="flex flex-col gap-2 min-h-0 h-full">
      <div className="relative shrink-0">
        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          type="search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t('wbs:treePicker.search')}
          className={`${inputClass} pl-7 py-1.5 text-sm`}
        />
      </div>
      <div className="border border-default rounded-md overflow-y-auto flex-1 min-h-0 bg-surface">
        {showRoot && (
          <RootRow
            selected={selectedId == null}
            onSelect={() => onSelect(null)}
          />
        )}
        {items.map((it) => (
          <Node
            key={it.id}
            item={it}
            depth={0}
            selectedId={selectedId}
            excludeIds={excludeIds}
            isExpanded={isExpanded}
            toggle={toggle}
            visible={visible}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function RootRow({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-2 py-1.5 text-sm flex items-center gap-1 border-b border-default hover:bg-surface-2 transition-colors ${
        selected ? 'bg-accent-soft text-accent' : 'text-secondary'
      }`}
    >
      <span className="w-4 inline-block" />
      <span className="text-muted">{t('wbs:treePicker.root')}</span>
    </button>
  );
}

function Node({
  item, depth, selectedId, excludeIds, isExpanded, toggle, visible, onSelect,
}: {
  item: WbsItem;
  depth: number;
  selectedId: number | null;
  excludeIds: Set<number>;
  isExpanded: (id: number) => boolean;
  toggle: (id: number) => void;
  visible: Set<number> | null;
  onSelect: (id: number | null) => void;
}) {
  const { t } = useTranslation();
  // 검색 활성 시: visible 에 없으면 본인+자손 모두 hide.
  if (visible && !visible.has(item.id)) return null;

  const hasChildren = (item.children?.length ?? 0) > 0;
  const expanded = isExpanded(item.id);
  const disabled = excludeIds.has(item.id);
  const selected = selectedId === item.id;

  return (
    <>
      <div
        className={`px-2 py-1 text-sm flex items-center gap-1 border-b border-default last:border-0 ${
          selected ? 'bg-accent-soft' : 'hover:bg-surface-2'
        } transition-colors`}
      >
        <div style={{ paddingLeft: depth * 16 }} className="flex items-center gap-1 flex-1 min-w-0">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggle(item.id)}
              className="text-muted hover:text-primary transition-colors shrink-0"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-3.5 inline-block shrink-0" />
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect(item.id)}
            className={`flex-1 text-left truncate ${
              disabled
                ? 'text-muted cursor-not-allowed opacity-50'
                : selected
                  ? 'text-accent'
                  : 'text-primary hover:text-accent cursor-pointer'
            } transition-colors`}
            title={disabled ? t('wbs:treePicker.disabledTitle') : item.name}
          >
            {item.name}
          </button>
        </div>
      </div>
      {expanded && item.children?.map((c) => (
        <Node
          key={c.id}
          item={c}
          depth={depth + 1}
          selectedId={selectedId}
          excludeIds={excludeIds}
          isExpanded={isExpanded}
          toggle={toggle}
          visible={visible}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}
