import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DevInfoItem } from '../types';
import { Badge } from './ui';
import { inputClass } from './ui';
import { devInfoTypeBadge } from '../utils/statusMaps';

type Props = {
  items: DevInfoItem[];            // 같은 프로젝트의 모든 업무 정보
  excludeIds: Set<number>;         // 이미 연결된 항목 (제외 표시)
  onSelect: (id: number) => void;
};

// 업무 정보(DevInfo) 선택 picker. 평면 list + 검색(제목·태그·본문) + 타입 배지.
// 높이는 부모 flex 컨테이너에 fit. IssuePicker 패턴을 그대로 따른다.
export function DevInfoPicker({ items, excludeIds, onSelect }: Props) {
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return items;
    return items.filter((i) =>
      i.title.toLowerCase().includes(kw) ||
      (i.tags ?? '').toLowerCase().includes(kw) ||
      (i.content ?? '').toLowerCase().includes(kw),
    );
  }, [items, keyword]);

  return (
    <div className="flex flex-col gap-2 min-h-0 h-full">
      <div className="relative shrink-0">
        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          type="search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t('wbs:relatedInfo.picker.search')}
          className={`${inputClass} pl-7 py-1.5 text-sm`}
        />
      </div>
      <div className="border border-default rounded-md overflow-y-auto flex-1 min-h-0 bg-surface">
        {filtered.length === 0 ? (
          <div className="px-2 py-4 text-xs text-muted text-center">{t('wbs:relatedInfo.picker.empty')}</div>
        ) : filtered.map((i) => {
          const disabled = excludeIds.has(i.id);
          return (
            <button
              key={i.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(i.id)}
              className={`w-full text-left px-2 py-1.5 text-sm flex items-center gap-2 border-b border-default last:border-0 ${
                disabled
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-surface-2 cursor-pointer'
              } transition-colors`}
              title={disabled ? t('wbs:relatedInfo.picker.linked') : i.title}
            >
              <Badge variant={devInfoTypeBadge[i.type].variant} size="sm">{i.type}</Badge>
              <span className="text-primary truncate flex-1">{i.title}</span>
              <span className="text-xs text-muted shrink-0">#{i.id}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
