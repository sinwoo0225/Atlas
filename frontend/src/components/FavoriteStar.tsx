import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  active: boolean;
  onToggle: () => void;
  size?: number;
  className?: string;
}

// 즐겨찾기(별표) 토글 버튼 — 이슈·변경이력·회의록·업무정보 목록 공용. 켜지면 채운 별 + 강조색.
export function FavoriteStar({ active, onToggle, size = 16, className = '' }: Props) {
  const { t } = useTranslation();
  const label = active ? t('common:favorite.remove') : t('common:favorite.add');
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`p-1 transition-colors ${active ? 'text-on-warning' : 'text-muted hover:text-on-warning'} ${className}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      <Star size={size} className={active ? 'fill-current' : ''} />
    </button>
  );
}
