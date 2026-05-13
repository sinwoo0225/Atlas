import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Diamond, GitBranch, FileText, Code2, Download, Package, Link as LinkIcon } from 'lucide-react';
import { projectsApi } from '../api/projects';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge';
import { attendeesToDisplay } from '../utils/meetingHelpers';
import { Button, Card, Badge, Spinner } from '../components/ui';
import { wbsStatusBadge, impactBadge } from '../utils/statusMaps';
import type { ProjectDashboard } from '../types';

export function Dashboard() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const [data, setData] = useState<ProjectDashboard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) return;
    projectsApi.getDashboard(parseInt(projectId))
      .then(setData)
      .catch(() => setError('대시보드를 불러올 수 없습니다.'));
  }, [projectId]);

  if (error) return <div className="p-6 text-sm text-on-danger">{error}</div>;
  if (!data) return <div className="p-6"><Spinner label="로딩 중..." /></div>;

  const { project: p, upcomingMilestones, recentChanges, recentMeetings, recentDevInfo } = data;
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
    <div className="p-6 space-y-5">
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
                catch { alert('백업에 실패했습니다.'); }
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
      </div>

      {(p.deliverables || p.relatedLinks) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
