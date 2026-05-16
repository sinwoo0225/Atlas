import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Diamond, GitBranch, FileText, Code2, Download, Package, Link as LinkIcon, AlertTriangle, NotebookPen, Activity, FolderOpen, CalendarDays, User } from 'lucide-react';
import { projectsApi } from '../api/projects';
import { activityApi } from '../api/activity';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge';
import { attendeesToDisplay } from '../utils/meetingHelpers';
import { Button, Card, Badge, Skeleton } from '../components/ui';
import { wbsStatusBadge, impactBadge, issueStatusBadge, issuePriorityBadge } from '../utils/statusMaps';
import type { ProjectDashboard, ActivityLog, ActivityEntityType, ActivityAction } from '../types';

// 활동 피드의 entity 타입별 라벨/아이콘 — CommandPalette TYPE_META 와 톤 동일.
const ACTIVITY_TYPE_META: Record<ActivityEntityType, { label: string; Icon: typeof Activity }> = {
  Project:     { label: '프로젝트',  Icon: FolderOpen },
  WbsItem:     { label: 'WBS',       Icon: CalendarDays },
  Issue:       { label: '이슈',      Icon: AlertTriangle },
  Meeting:     { label: '회의록',    Icon: FileText },
  ChangeLog:   { label: '변경',      Icon: GitBranch },
  DevInfoItem: { label: '개발정보',  Icon: Code2 },
  WorkLog:     { label: '업무일지',  Icon: NotebookPen },
  Resource:    { label: '리소스',    Icon: User },
};

const ACTION_META: Record<ActivityAction, { label: string; variant: 'success' | 'info' | 'danger' }> = {
  Create: { label: '생성', variant: 'success' },
  Update: { label: '수정', variant: 'info' },
  Delete: { label: '삭제', variant: 'danger' },
};

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return '방금';
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d === 1) return '어제';
  if (d < 7) return `${d}일 전`;
  return iso.slice(0, 10);
}

function activityUrl(a: ActivityLog): string | null {
  if (a.entityType === 'Resource') return '/resources';
  const pid = a.projectId;
  if (pid == null) return null;
  switch (a.entityType) {
    case 'Project':     return `/projects/${pid}/dashboard`;
    case 'WbsItem':     return `/projects/${pid}/wbs?highlight=${a.entityId}`;
    case 'Issue':       return `/projects/${pid}/issues?highlight=${a.entityId}`;
    case 'Meeting':     return `/projects/${pid}/meetings?highlight=${a.entityId}`;
    case 'ChangeLog':   return `/projects/${pid}/changelogs?highlight=${a.entityId}`;
    case 'DevInfoItem': return `/projects/${pid}/devinfo?highlight=${a.entityId}`;
    case 'WorkLog': {
      const m = a.entityTitle.match(/(\d{4}-\d{2}-\d{2})/);
      return m ? `/projects/${pid}/worklog?date=${m[1]}` : `/projects/${pid}/worklog`;
    }
    default: return null;
  }
}

export function Dashboard() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const [data, setData] = useState<ProjectDashboard | null>(null);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) return;
    const pid = parseInt(projectId);
    projectsApi.getDashboard(pid)
      .then(setData)
      .catch(() => setError('대시보드를 불러올 수 없습니다.'));
    activityApi.getByProject(pid, 20)
      .then(setActivities)
      .catch(() => setActivities([]));
  }, [projectId]);

  if (error) return <div className="p-6 text-sm text-on-danger">{error}</div>;
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

  const { project: p, upcomingMilestones, recentChanges, recentMeetings, recentDevInfo, recentIssues, thisWeekWorkLog } = data;
  const pid = p.id;

  const daysLeft = p.endDate
    ? Math.ceil((new Date(p.endDate).getTime() - Date.now()) / 86400000)
    : null;

  const daysLeftTone =
    daysLeft === null ? '' :
    daysLeft < 0 ? 'text-on-danger' :
    daysLeft < 7 ? 'text-on-warning' :
    'text-on-success';

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
          <div className="flex items-center gap-3 shrink-0">
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
            {daysLeft !== null && (
              <div className={`text-right ${daysLeftTone}`}>
                <p className="text-xl font-semibold">{Math.abs(daysLeft)}일</p>
                <p className="text-xs">{daysLeft < 0 ? '초과' : '남음'}</p>
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {[
            { label: '시작일', value: p.startDate?.slice(0, 10) ?? '-' },
            { label: '종료일', value: p.endDate?.slice(0, 10) ?? '-' },
            { label: '예산', value: p.budget ? `${p.budget.toLocaleString()}원` : '-' },
            { label: '참여 인원', value: p.participants || '-' },
          ].map((item) => (
            <div key={item.label} className="border border-default rounded-md p-3">
              <p className="text-xs text-muted">{item.label}</p>
              <p className="text-sm text-secondary mt-1">{item.value}</p>
            </div>
          ))}
        </div>
        {p.description && (
          <p className="text-sm text-secondary mt-4 border-t border-default pt-4 whitespace-pre-wrap">{p.description}</p>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="주요 마일스톤" Icon={Diamond}>
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
                    {wbsStatusBadge[m.status].label}
                  </Badge>
                  <span className="text-xs text-muted">{m.endDate?.slice(0, 10)}</span>
                </div>
              </div>
            ))
          )}
        </Section>

        <Section title="최근 변경 이력" Icon={GitBranch}>
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

        <Section title="최근 회의록" Icon={FileText}>
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

        <Section title="개발 정보" Icon={Code2}>
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

        <Section title="이슈" Icon={AlertTriangle}>
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
                  <Badge variant={issueStatusBadge[i.status].variant} size="sm">{issueStatusBadge[i.status].label}</Badge>
                  <Badge variant={issuePriorityBadge[i.priority].variant} size="sm">{issuePriorityBadge[i.priority].label}</Badge>
                  {i.dueDate && <span className="text-xs text-muted">~ {i.dueDate.slice(0, 10)}</span>}
                </div>
                <p className="text-sm text-secondary mt-0.5 line-clamp-1">{i.title}</p>
                {i.assigneeName && <p className="text-xs text-muted mt-0.5">담당: {i.assigneeName}</p>}
              </div>
            ))
          )}
        </Section>

        <Section title="이번 주 업무일지" Icon={NotebookPen}>
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

        <div className="lg:col-span-2">
          <Section title="최근 활동" Icon={Activity}>
            {activities.length === 0 ? (
              <Empty text="활동 기록 없음" />
            ) : (
              activities.map((a) => {
                const meta = ACTIVITY_TYPE_META[a.entityType];
                const action = ACTION_META[a.action];
                const url = activityUrl(a);
                const Icon = meta.Icon;
                const row = (
                  <div className="flex items-center gap-2 py-1.5 border-b border-default last:border-0">
                    <Icon size={14} className="text-muted shrink-0" />
                    <span className="text-xs text-muted shrink-0 w-12">{meta.label}</span>
                    <Badge variant={action.variant} size="sm">{action.label}</Badge>
                    <span className="text-sm text-secondary truncate flex-1 min-w-0">{a.entityTitle || `#${a.entityId}`}</span>
                    {a.actor && <span className="text-xs text-muted shrink-0">{a.actor}</span>}
                    <span className="text-xs text-muted shrink-0 w-16 text-right">{relativeTime(a.timestamp)}</span>
                  </div>
                );
                return url ? (
                  <div
                    key={a.id}
                    onClick={() => navigate(url)}
                    className="cursor-pointer hover:bg-surface-2 px-2 -mx-2 rounded transition-colors"
                  >
                    {row}
                  </div>
                ) : (
                  <div key={a.id} className="px-2 -mx-2">{row}</div>
                );
              })
            )}
          </Section>
        </div>
      </div>

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
}: {
  title: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card padding="spacious">
      <h2 className="h-card mb-3 flex items-center gap-2">
        <Icon size={16} className="text-muted" />
        {title}
      </h2>
      {children}
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted py-2">{text}</p>;
}
