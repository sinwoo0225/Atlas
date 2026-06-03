import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, CalendarClock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, Skeleton } from '../../components/ui';
import type { ReviewCompletedItem, ReviewDeadlineItem, WeeklyReview } from '../../types';

const MAX_ROWS = 8;

// '일지' 탭 상단 주간 회고 다이제스트 — 완료한 항목 / 놓친 마감 / 다음 주 마감 예정 3열.
// 항목 클릭 시 소스 엔티티(highlight)로 이동 — MonitoringRiskCard 와 동일 규약.
function entityUrl(kind: 'wbs' | 'issue', projectId: number, id: number): string {
  return kind === 'wbs'
    ? `/projects/${projectId}/wbs?highlight=${id}`
    : `/projects/${projectId}/issues?highlight=${id}`;
}

export function WeeklyReviewCard({ review, loading }: { review: WeeklyReview | null; loading: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const completed = review?.completed ?? [];
  const missed = review?.missedDeadlines ?? [];
  const upcoming = review?.upcomingNextWeek ?? [];

  const row = (
    key: string,
    kind: 'wbs' | 'issue',
    projectId: number,
    id: number,
    title: string,
    projectName: string,
    meta?: string,
    metaTone?: 'danger' | 'muted',
  ) => (
    <button
      key={key}
      type="button"
      onClick={() => navigate(entityUrl(kind, projectId, id))}
      className="w-full text-left flex items-center gap-2 py-1 px-2 -mx-2 rounded hover:bg-surface-2 transition-colors"
    >
      <span className="text-sm text-secondary truncate flex-1 min-w-0">{title}</span>
      <span className="text-xs text-muted shrink-0 truncate max-w-[38%]">{projectName}</span>
      {meta && (
        <span className={`text-xs shrink-0 ${metaTone === 'danger' ? 'text-on-danger' : 'text-muted'}`}>{meta}</span>
      )}
    </button>
  );

  return (
    <Card padding="spacious">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h2 className="h-card flex items-center gap-2">
          <CheckCircle2 size={16} className="text-accent" />
          {t('monitoring:review.title')}
          {review && <span className="text-xs font-normal text-muted">{t('monitoring:weekSuffix', { date: review.weekStart })}</span>}
        </h2>
        <div className="flex items-center gap-2.5">
          <CountChip label={t('monitoring:review.chipDone')} count={completed.length} />
          <CountChip label={t('monitoring:review.chipMissed')} count={missed.length} tone="danger" />
          <CountChip label={t('monitoring:review.chipNext')} count={upcoming.length} />
        </div>
      </div>

      {loading && !review ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} height={96} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Column
            title={t('monitoring:review.colDone')}
            count={completed.length}
            icon={<CheckCircle2 size={12} />}
            empty={t('monitoring:review.colDoneEmpty')}
          >
            {completed.slice(0, MAX_ROWS).map((it: ReviewCompletedItem) =>
              row(`c-${it.kind}-${it.id}`, it.kind, it.projectId, it.id, it.title, it.projectName,
                it.completedAt.slice(5).replace('-', '/'), 'muted'))}
            {completed.length > MAX_ROWS && <MoreText count={completed.length - MAX_ROWS} />}
          </Column>

          <Column
            title={t('monitoring:review.colMissed')}
            count={missed.length}
            tone="danger"
            icon={<AlertTriangle size={12} />}
            empty={t('monitoring:review.colMissedEmpty')}
          >
            {missed.slice(0, MAX_ROWS).map((it: ReviewDeadlineItem) =>
              row(`m-${it.kind}-${it.id}`, it.kind, it.projectId, it.id, it.title, it.projectName, it.dueDate, 'danger'))}
            {missed.length > MAX_ROWS && <MoreText count={missed.length - MAX_ROWS} />}
          </Column>

          <Column
            title={t('monitoring:review.colUpcoming')}
            count={upcoming.length}
            icon={<CalendarClock size={12} />}
            empty={t('monitoring:review.colUpcomingEmpty')}
          >
            {upcoming.slice(0, MAX_ROWS).map((it: ReviewDeadlineItem) =>
              row(`u-${it.kind}-${it.id}`, it.kind, it.projectId, it.id, it.title, it.projectName, it.dueDate, 'muted'))}
            {upcoming.length > MAX_ROWS && <MoreText count={upcoming.length - MAX_ROWS} />}
          </Column>
        </div>
      )}
    </Card>
  );
}

function CountChip({ label, count, tone }: { label: string; count: number; tone?: 'danger' }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold">
      <span className={`tabular-nums ${tone === 'danger' && count > 0 ? 'text-on-danger' : 'text-primary'}`}>{count}</span>
      <span className="font-normal text-muted">{label}</span>
    </span>
  );
}

function MoreText({ count }: { count: number }) {
  const { t } = useTranslation();
  return <p className="text-xs text-muted mt-1">{t('monitoring:more', { count })}</p>;
}

function Column({
  title, count, tone, icon, empty, children,
}: {
  title: string;
  count: number;
  tone?: 'danger';
  icon: React.ReactNode;
  empty: string;
  children: React.ReactNode;
}) {
  const toneClass = tone === 'danger' ? 'text-on-danger' : 'text-secondary';
  return (
    <div>
      <p className={`text-xs font-medium mb-2 flex items-center gap-1 ${toneClass}`}>
        {icon}
        {title} ({count})
      </p>
      {count === 0 ? <p className="text-xs text-muted italic">{empty}</p> : <div className="space-y-0">{children}</div>}
    </div>
  );
}
