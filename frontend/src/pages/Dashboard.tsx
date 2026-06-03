import { useCallback, useEffect, useState, type ElementType } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Diamond, GitBranch, FileText, Code2, Download, Package, Link as LinkIcon, AlertTriangle, NotebookPen, Activity, ChevronRight } from 'lucide-react';
import { projectsApi } from '../api/projects';
import { activityApi } from '../api/activity';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge';
import { ActivityRow } from '../components/ActivityRow';
import { RiskAlertCard } from './dashboard/RiskAlertCard';
import { attendeesToDisplay } from '../utils/meetingHelpers';
import { Button, Card, Badge, Skeleton, EmptyState } from '../components/ui';
import { wbsStatusBadge, impactBadge, issueStatusBadge, issuePriorityBadge } from '../utils/statusMaps';
import type { ProjectDashboard, ActivityLog } from '../types';

export function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const [data, setData] = useState<ProjectDashboard | null>(null);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    if (!projectId) return;
    const pid = parseInt(projectId);
    setError(null);
    setData(null);
    projectsApi.getDashboard(pid)
      .then(setData)
      .catch((e) => setError(e ?? new Error('대시보드를 불러올 수 없습니다.')));
    activityApi.getByProject(pid, 20)
      .then(setActivities)
      .catch(() => setActivities([]));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (error) return (
    <div className="p-6">
      <Card padding="spacious">
        <EmptyState error={error} onRetry={load} />
      </Card>
    </div>
  );
  if (!data) return (
    <div className="p-6 space-y-6">
      <Card padding="spacious">
        <Skeleton height={28} width="40%" />
        <Skeleton height={12} width="60%" className="mt-3" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={48} />)}
        </div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} padding="spacious">
            <Skeleton height={18} width="35%" />
            <div className="mt-3"><Skeleton height={12} count={3} /></div>
          </Card>
        ))}
      </div>
    </div>
  );

  const { project: p, upcomingMilestones, recentChanges, recentMeetings, recentDevInfo, recentIssues, thisWeekWorkLog, riskSignals } = data;
  const pid = p.id;

  const daysLeft = p.endDate
    // eslint-disable-next-line react-hooks/purity -- 표시용 D-day, 렌더 시점 현재시각이 의도된 값
    ? Math.ceil((new Date(p.endDate).getTime() - Date.now()) / 86400000)
    : null;

  const daysLeftTone =
    daysLeft === null ? '' :
    daysLeft < 0 ? 'text-on-danger' :
    daysLeft < 7 ? 'text-on-warning' :
    'text-on-success';

  // KPI 산출
  const workLogFilled = thisWeekWorkLog
    ? thisWeekWorkLog.days.filter((d) => d.done || d.plan || d.issues).length
    : 0;
  const workLogTotal = thisWeekWorkLog?.days.length ?? 7;
  const overdueCount = riskSignals.overdueWbs.length;
  const dueSoonCount = riskSignals.dueSoonWbs.length;

  return (
    <div className="p-6 space-y-6">
      <Card padding="spacious">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h1 className="h-page">{p.name}</h1>
              <ProjectStatusBadge status={p.status} />
            </div>
            {p.goal && <p className="text-sm text-secondary">{p.goal}</p>}
          </div>
          <Button
            variant="secondary"
            leadingIcon={<Download size={16} />}
            title="프로젝트 백업"
            onClick={async () => {
              try { await projectsApi.backup(p.id, p.name); }
              catch { toast.error('백업에 실패했습니다.'); }
            }}
          >
            백업
          </Button>
        </div>

        {/* KPI 행 (P4-1) — D-day / 업무일지 채움 / 지연 / 임박 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div className="border border-default rounded-md p-3">
            <p className="text-xs text-muted">D-day</p>
            <p className={`text-2xl font-semibold mt-0.5 ${daysLeftTone}`}>
              {daysLeft === null ? '-' : `${daysLeft < 0 ? '+' : 'D-'}${Math.abs(daysLeft)}`}
            </p>
            <p className="text-xs text-muted">{daysLeft === null ? '종료일 미설정' : (daysLeft < 0 ? '초과' : '남음')}</p>
          </div>
          <div className="border border-default rounded-md p-3">
            <p className="text-xs text-muted">이번 주 업무일지</p>
            <p className="text-2xl font-semibold mt-0.5 text-primary">{workLogFilled}<span className="text-sm text-muted">/{workLogTotal}</span></p>
            <p className="text-xs text-muted">채운 일수</p>
          </div>
          <div className="border border-default rounded-md p-3">
            <p className="text-xs text-muted">지연된 WBS</p>
            <p className={`text-2xl font-semibold mt-0.5 ${overdueCount > 0 ? 'text-on-danger' : 'text-muted'}`}>{overdueCount}</p>
            <p className="text-xs text-muted">EndDate 초과</p>
          </div>
          <div className="border border-default rounded-md p-3">
            <p className="text-xs text-muted">임박 마감</p>
            <p className={`text-2xl font-semibold mt-0.5 ${dueSoonCount > 0 ? 'text-on-warning' : 'text-muted'}`}>{dueSoonCount}</p>
            <p className="text-xs text-muted">~7일 내</p>
          </div>
        </div>

        {/* 보조 정보 (시작일/종료일/예산/참여 인원) — KPI 보다 시각 약화 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
          {[
            { label: '시작일', value: p.startDate?.slice(0, 10) ?? '-' },
            { label: '종료일', value: p.endDate?.slice(0, 10) ?? '-' },
            { label: '예산', value: p.budget ? `${p.budget.toLocaleString()}원` : '-' },
            { label: '참여 인원', value: p.participants || '-' },
          ].map((item) => (
            <div key={item.label} className="flex justify-between items-baseline px-2">
              <span className="text-muted">{item.label}</span>
              <span className="text-secondary truncate ml-2">{item.value}</span>
            </div>
          ))}
        </div>

        {p.description && (
          <p className="text-sm text-secondary mt-4 border-t border-default pt-4 whitespace-pre-wrap">{p.description}</p>
        )}
      </Card>

      <RiskAlertCard signals={riskSignals} projectId={pid} />

      {/* 액션 필요 — 마일스톤·이슈 (위험 외 핵심 추적 대상) */}
      <GroupHeader label="액션 필요" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="주요 마일스톤" Icon={Diamond} to={`/projects/${pid}/wbs`}>
          {upcomingMilestones.length === 0 ? (
            <Empty text="예정된 마일스톤 없음" />
          ) : (
            upcomingMilestones.map((m) => (
              <div
                key={m.id}
                onClick={() => navigate(`/projects/${pid}/wbs`)}
                className="flex items-center justify-between py-2 border-b border-default last:border-0 cursor-pointer hover:bg-surface-2 px-2 -mx-2 rounded transition-colors"
              >
                <span className="text-sm text-secondary">{m.name}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={wbsStatusBadge[m.status].variant} size="sm">
                    {t(wbsStatusBadge[m.status].labelKey)}
                  </Badge>
                  <span className="text-xs text-muted">{m.endDate?.slice(0, 10)}</span>
                </div>
              </div>
            ))
          )}
        </Section>

        <Section title="이슈" Icon={AlertTriangle} to={`/projects/${pid}/issues`}>
          {recentIssues.length === 0 ? (
            <Empty text="등록된 이슈 없음" />
          ) : (
            recentIssues.map((i) => (
              <div
                key={i.id}
                onClick={() => navigate(`/projects/${pid}/issues`)}
                className="py-2 border-b border-default last:border-0 cursor-pointer hover:bg-surface-2 px-2 -mx-2 rounded transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Badge variant={issueStatusBadge[i.status].variant} size="sm">{t(issueStatusBadge[i.status].labelKey)}</Badge>
                  <Badge variant={issuePriorityBadge[i.priority].variant} size="sm">{t(issuePriorityBadge[i.priority].labelKey)}</Badge>
                  {i.dueDate && <span className="text-xs text-muted">~ {i.dueDate.slice(0, 10)}</span>}
                </div>
                <p className="text-sm text-secondary mt-0.5 line-clamp-1">{i.title}</p>
                {i.assigneeName && <p className="text-xs text-muted mt-0.5">담당: {i.assigneeName}</p>}
              </div>
            ))
          )}
        </Section>
      </div>

      {/* 참고 — 회의록·변경·DevInfo·일지 (조회 빈도 낮은 컨텍스트) */}
      <GroupHeader label="참고" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="최근 회의록" Icon={FileText} to={`/projects/${pid}/meetings`} compact>
          {recentMeetings.length === 0 ? (
            <Empty text="회의록 없음" />
          ) : (
            recentMeetings.map((m) => (
              <div
                key={m.id}
                onClick={() => navigate(`/projects/${pid}/meetings`)}
                className="py-2 border-b border-default last:border-0 cursor-pointer hover:bg-surface-2 px-2 -mx-2 rounded transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-secondary line-clamp-1">{m.topic}</span>
                  <span className="text-xs text-muted shrink-0 ml-2">{m.date.slice(0, 10)}</span>
                </div>
                <p className="text-xs text-muted mt-0.5 line-clamp-1">{attendeesToDisplay(m.attendees)}</p>
              </div>
            ))
          )}
        </Section>

        <Section title="최근 변경 이력" Icon={GitBranch} to={`/projects/${pid}/changelogs`} compact>
          {recentChanges.length === 0 ? (
            <Empty text="변경 이력 없음" />
          ) : (
            recentChanges.map((c) => (
              <div
                key={c.id}
                onClick={() => navigate(`/projects/${pid}/changelogs`)}
                className="py-2 border-b border-default last:border-0 cursor-pointer hover:bg-surface-2 px-2 -mx-2 rounded transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Badge variant={impactBadge[c.impact].variant} size="sm">{c.impact}</Badge>
                  <span className="text-xs text-muted">{c.date.slice(0, 10)}</span>
                </div>
                <p className="text-sm text-secondary mt-0.5 line-clamp-1">{c.content}</p>
              </div>
            ))
          )}
        </Section>

        <Section title="개발 정보" Icon={Code2} to={`/projects/${pid}/devinfo`} compact>
          {recentDevInfo.length === 0 ? (
            <Empty text="개발 정보 없음" />
          ) : (
            recentDevInfo.map((d) => (
              <div
                key={d.id}
                onClick={() => navigate(`/projects/${pid}/devinfo`)}
                className="flex items-center gap-2 py-2 border-b border-default last:border-0 cursor-pointer hover:bg-surface-2 px-2 -mx-2 rounded transition-colors"
              >
                <Badge variant="neutral" size="sm">{d.type}</Badge>
                <span className="text-sm text-secondary line-clamp-1">{d.title}</span>
              </div>
            ))
          )}
        </Section>

        <Section title="이번 주 업무일지" Icon={NotebookPen} to={`/projects/${pid}/worklog`} compact>
          {!thisWeekWorkLog || thisWeekWorkLog.days.every((d) => !d.done && !d.plan && !d.issues) ? (
            <Empty text="이번 주 기록 없음" />
          ) : (
            <div
              className="cursor-pointer hover:bg-surface-2 px-2 -mx-2 py-1 rounded transition-colors"
              onClick={() => navigate(`/projects/${pid}/worklog`)}
            >
              {thisWeekWorkLog.days
                .filter((d) => d.done || d.plan || d.issues)
                .map((d) => {
                  const firstLine = (d.done || d.plan || d.issues).split('\n').find((l) => l.trim()) ?? '';
                  return (
                    <div key={d.dayIndex} className="flex items-baseline gap-2 py-1 border-b border-default last:border-0">
                      <span className="text-xs text-muted font-medium shrink-0 w-12">{d.dayLabel} {d.date.slice(5).replace('-', '/')}</span>
                      <span className="text-sm text-secondary line-clamp-1 flex-1 min-w-0">{firstLine || '_(빈 항목)_'}</span>
                    </div>
                  );
                })}
            </div>
          )}
        </Section>
      </div>

      {/* 최근 활동 — 전폭, 그룹 외 */}
      <Section title="최근 활동" Icon={Activity} to="/activity" compact>
        {activities.length === 0 ? (
          <Empty text="활동 기록 없음" />
        ) : (
          activities.map((a) => <ActivityRow key={a.id} activity={a} />)
        )}
      </Section>

      {(p.deliverables || p.relatedLinks) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {p.deliverables && (
            <Section title="주요 산출물" Icon={Package}>
              <p className="text-sm text-secondary whitespace-pre-wrap">{p.deliverables}</p>
            </Section>
          )}
          {p.relatedLinks && (
            <Section title="관련 링크" Icon={LinkIcon}>
              {p.relatedLinks.split('\n').filter(Boolean).map((link, i) => (
                <a
                  key={i}
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-sm text-secondary hover:text-primary hover:underline truncate py-1 transition-colors"
                >
                  {link}
                </a>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  Icon,
  children,
  to,
  compact = false,
}: {
  title: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
  /** 헤더 우측 chevron + click navigate (P4-4) */
  to?: string;
  /** 컴팩트 톤 (P4-3 부 정보) — padding/font 축소 */
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const HeaderTag: ElementType = to ? 'button' : 'div';
  return (
    <Card padding={compact ? 'normal' : 'spacious'}>
      <HeaderTag
        type={to ? 'button' : undefined}
        onClick={to ? () => navigate(to) : undefined}
        className={`w-full ${compact ? 'mb-2' : 'mb-3'} flex items-center justify-between ${to ? 'text-left hover:text-accent transition-colors group' : ''}`}
      >
        <h2 className={`${compact ? 'text-xs' : 'h-card'} flex items-center gap-2`}>
          <Icon size={compact ? 14 : 16} className="text-muted" />
          {title}
        </h2>
        {to && <ChevronRight size={14} className="text-muted group-hover:text-accent transition-colors shrink-0" />}
      </HeaderTag>
      {children}
    </Card>
  );
}

// 그룹 헤더 — 액션/참고 같은 위젯 묶음 위에 얹는 옅은 라벨.
function GroupHeader({ label }: { label: string }) {
  return (
    <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mt-2">{label}</h3>
  );
}

function Empty({ text }: { text: string }) {
  return <EmptyState title={text} className="py-2" />;
}
