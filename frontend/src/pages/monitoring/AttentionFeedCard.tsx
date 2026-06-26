import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, Gauge, Clock, CalendarClock, UserPlus, Flag, PauseCircle, CheckCircle2, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, Skeleton } from '../../components/ui';
import type { AttentionFeed, AttentionItem } from '../../types';

interface Props {
  data: AttentionFeed | null;
  loading: boolean;
  // 'people' 같은 탭 전환 링크 처리(없으면 무시).
  onSelectTab?: (tab: string) => void;
}

const KIND_ICON: Record<AttentionItem['kind'], typeof Bell> = {
  overdue: AlertTriangle,
  overallocated: Gauge,
  lateStart: CalendarClock,
  dueSoon: Clock,
  unassigned: UserPlus,
  milestone: Flag,
  stale: PauseCircle,
};

// severity → 좌측 막대(인라인 CSS var)·카운트 텍스트 색.
const SEV_VAR: Record<AttentionItem['severity'], string> = {
  high: 'var(--text-on-danger)',
  medium: 'var(--text-on-warning)',
  low: 'var(--text-muted)',
};
const SEV_TEXT: Record<AttentionItem['severity'], string> = {
  high: 'text-on-danger',
  medium: 'text-on-warning',
  low: 'text-muted',
};

export function AttentionFeedCard({ data, loading, onSelectTab }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleClick = (item: AttentionItem) => {
    if (item.link === 'people') onSelectTab?.('people');
    else if (item.link.startsWith('/')) navigate(item.link);
  };

  return (
    <Card padding="normal">
      <h3 className="h-card flex items-center gap-2 mb-2">
        <Bell size={16} className="text-muted" />
        {t('monitoring:attention.title')}
        {data && data.highCount > 0 && (
          <span className="text-xs font-semibold text-on-danger">{t('monitoring:attention.highBadge', { count: data.highCount })}</span>
        )}
      </h3>
      {loading || !data ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} height={36} />)}</div>
      ) : data.items.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted py-4 px-1">
          <CheckCircle2 size={18} className="text-on-success" />
          {t('monitoring:attention.allClear')}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {data.items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <li key={item.kind}>
                <button
                  type="button"
                  onClick={() => handleClick(item)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-surface-2 border border-default hover:bg-surface-3 transition-colors text-left"
                >
                  <span className="w-1 h-6 rounded-full shrink-0" style={{ backgroundColor: SEV_VAR[item.severity] }} />
                  <Icon size={16} className={SEV_TEXT[item.severity]} />
                  <span className="flex-1 text-sm text-primary truncate">{t(`monitoring:attention.kind.${item.kind}`)}</span>
                  <span className={`text-sm font-semibold ${SEV_TEXT[item.severity]}`}>{item.count}</span>
                  <ChevronRight size={14} className="text-muted shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
