import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui';
import { WeeklySection, OpenIssuesSection } from '../monitoring/WeeklySection';
import { WeeklyReviewCard } from '../monitoring/WeeklyReviewCard';
import { worklogApi } from '../../api/worklog';
import { monitoringApi } from '../../api/monitoring';
import { loadSettings } from '../../store/settings';
import type { WeeklyReview, WeeklyWorkLog, OpenIssuesByProject, NextWeekPlanByProject } from '../../types';

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfWeek(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); // Monday = 0
  return date;
}

// 업무일지 화면에서 여는 '이번 주 통합 업무일지' 모달.
// 통합 모니터링의 '일지' 탭과 같은 뷰(WeeklySection)를 재사용한다.
// ⚠ 이 엔드포인트는 **전 프로젝트 통합**이다(현재 프로젝트로 좁혀지지 않는다) — 요청이 '통합 모니터링의
// 주간 업무일지'이므로 통합 뷰를 그대로 보여주되, 지금 보고 있는 프로젝트 카드를 맨 앞으로 끌어올린다.
export function WeeklyMonitoringModal({ open, onClose, currentProjectId }: {
  open: boolean;
  onClose: () => void;
  currentProjectId?: number;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState<WeeklyWorkLog | null>(null);
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [openIssues, setOpenIssues] = useState<OpenIssuesByProject[]>([]);
  const [plan, setPlan] = useState<NextWeekPlanByProject[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    const thisMon = isoDate(startOfWeek(new Date()));
    const mode = loadSettings().weeklyWorkLogMode;
    Promise.all([
      worklogApi.weeklyMonitoring(thisMon, mode),
      monitoringApi.openIssues(),
      monitoringApi.nextWeekPlan(thisMon),
      monitoringApi.getWeeklyReview(thisMon),
    ])
      .then(([w, iss, pl, rev]) => {
        if (!alive) return;
        setData(w);
        setOpenIssues(iss);
        setPlan(pl);
        setReview(rev);
      })
      .catch(() => { if (alive) { setData(null); setOpenIssues([]); setPlan([]); setReview(null); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open]);

  // 현재 프로젝트 카드를 맨 앞으로.
  const orderedData = useMemo<WeeklyWorkLog | null>(() => {
    if (!data || currentProjectId == null) return data;
    const mine = data.projects.filter((p) => p.projectId === currentProjectId);
    if (mine.length === 0) return data;
    const rest = data.projects.filter((p) => p.projectId !== currentProjectId);
    return { ...data, projects: [...mine, ...rest] };
  }, [data, currentProjectId]);

  const goProject = (id: number) => { onClose(); navigate(`/projects/${id}/worklog`); };

  return (
    <Modal open={open} onClose={onClose} title={t('worklog:weeklyMonitoring.modalTitle')} size="7xl" fixedHeight showCloseButton>
      <div className="flex-1 min-h-0 overflow-auto space-y-4">
        {loading ? (
          <Spinner label={t('common:loading')} />
        ) : (
          <>
            <WeeklyReviewCard review={review} loading={false} />
            <WeeklySection
              title={t('monitoring:logs.thisWeek')}
              data={orderedData}
              loading={false}
              onProjectClick={goProject}
              variant="current"
              exportable
              openIssues={openIssues}
              review={review}
              plan={plan}
            />
            <OpenIssuesSection openIssues={openIssues} loading={false} onProjectClick={(id) => { onClose(); navigate(`/projects/${id}/issues`); }} />
          </>
        )}
      </div>
    </Modal>
  );
}
