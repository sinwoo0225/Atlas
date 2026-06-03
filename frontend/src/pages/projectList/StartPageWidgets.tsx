import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, CalendarClock, History } from 'lucide-react';
import { Card, Modal } from '../../components/ui';
import type { StartPageItem } from '../../types';
import type { RecentItem } from '../../utils/recentItems';

const MAX_ROWS = 5;

// 섹션 키 → nav 라벨 키 재사용.
const SECTION_LABEL_KEYS: Record<string, string> = {
  dashboard: 'nav:dashboard',
  wbs: 'nav:wbs',
  worklog: 'nav:worklog',
  issues: 'nav:issues',
  changelogs: 'nav:changelogs',
  meetings: 'nav:meetings',
  devinfo: 'nav:devinfo',
  map: 'nav:map',
};

interface Props {
  myOpenItems: StartPageItem[];
  dueSoonItems: StartPageItem[];
  recent: RecentItem[];
}

// E-2 시작 화면 위젯 — 3 column. 셋 모두 0 이면 row 자체 미노출.
export function StartPageWidgets({ myOpenItems, dueSoonItems, recent }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showAllMine, setShowAllMine] = useState(false);
  if (myOpenItems.length + dueSoonItems.length + recent.length === 0) return null;

  const itemPath = (it: StartPageItem) =>
    it.kind === 'issue'
      ? `/projects/${it.projectId}/issues?highlight=${it.id}`
      : `/projects/${it.projectId}/wbs?highlight=${it.id}`;

  const goItem = (it: StartPageItem) => {
    setShowAllMine(false);
    navigate(itemPath(it));
  };

  const itemRow = (it: StartPageItem) => (
    <button
      key={`${it.kind}-${it.id}`}
      type="button"
      onClick={() => goItem(it)}
      className="w-full text-left flex items-center gap-2 py-1 px-2 -mx-2 rounded hover:bg-surface-2 transition-colors"
    >
      <span className="text-sm text-secondary truncate flex-1 min-w-0">{it.title}</span>
      <span className="text-xs text-muted shrink-0 truncate max-w-[8rem]">{it.projectName}</span>
      {it.dueDate && (
        <span className="text-xs text-on-warning shrink-0">{it.dueDate.slice(0, 10)}</span>
      )}
    </button>
  );

  const recentRow = (r: RecentItem) => (
    <button
      key={r.path}
      type="button"
      onClick={() => navigate(r.path)}
      className="w-full text-left flex items-center gap-2 py-1 px-2 -mx-2 rounded hover:bg-surface-2 transition-colors"
    >
      <span className="text-sm text-secondary truncate flex-1 min-w-0">{r.projectName}</span>
      <span className="text-xs text-muted shrink-0">{SECTION_LABEL_KEYS[r.section] ? t(SECTION_LABEL_KEYS[r.section]) : r.section}</span>
    </button>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <Widget
        icon={<CheckCircle2 size={14} className="text-accent" />}
        title={t('projects:start.myTasks')}
        count={myOpenItems.length}
        empty={t('projects:start.myTasksEmpty')}
        overflow={0}
        action={
          myOpenItems.length > MAX_ROWS ? (
            <button
              type="button"
              onClick={() => setShowAllMine(true)}
              className="text-xs text-accent hover:underline shrink-0"
            >
              {t('projects:start.viewAll')}
            </button>
          ) : undefined
        }
      >
        {myOpenItems.slice(0, MAX_ROWS).map(itemRow)}
      </Widget>
      <Widget
        icon={<CalendarClock size={14} className="text-on-warning" />}
        title={t('projects:start.dueSoon')}
        count={dueSoonItems.length}
        empty={t('projects:start.dueSoonEmpty')}
        overflow={dueSoonItems.length > MAX_ROWS ? dueSoonItems.length - MAX_ROWS : 0}
      >
        {dueSoonItems.slice(0, MAX_ROWS).map(itemRow)}
      </Widget>
      <Widget
        icon={<History size={14} className="text-muted" />}
        title={t('projects:start.recent')}
        count={recent.length}
        empty={t('projects:start.recentEmpty')}
        overflow={0}
      >
        {recent.slice(0, MAX_ROWS).map(recentRow)}
      </Widget>

      <Modal
        open={showAllMine}
        onClose={() => setShowAllMine(false)}
        title={t('projects:start.myTasksModal', { count: myOpenItems.length })}
        size="lg"
        fixedHeight
        showCloseButton
      >
        <div className="flex-1 overflow-y-auto space-y-0">{myOpenItems.map(itemRow)}</div>
      </Modal>
    </div>
  );
}

function Widget({
  icon,
  title,
  count,
  empty,
  overflow,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  empty: string;
  overflow: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Card padding="spacious">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h2 className="h-card">
          {title} ({count})
        </h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {count === 0 ? (
        <p className="text-xs text-muted italic">{empty}</p>
      ) : (
        <div className="space-y-0">
          {children}
          {overflow > 0 && <p className="text-xs text-muted mt-1 px-2">{t('projects:start.more', { count: overflow })}</p>}
        </div>
      )}
    </Card>
  );
}
