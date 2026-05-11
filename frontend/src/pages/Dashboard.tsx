import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Diamond, GitBranch, FileText, Code2, Download, Package, Link as LinkIcon } from 'lucide-react';
import { projectsApi } from '../api/projects';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge';
import { attendeesToDisplay } from '../utils/meetingHelpers';
import type { ProjectDashboard } from '../types';

const impactColor = {
  Low: 'text-emerald-400',
  Medium: 'text-amber-400',
  High: 'text-orange-400',
  Critical: 'text-red-400',
};
const wbsBadge = {
  Planned: 'bg-zinc-700/40 text-slate-300',
  InProgress: 'bg-amber-500/15 text-amber-300',
  Done: 'bg-emerald-500/15 text-emerald-300',
};
const wbsLabel = { Planned: '예정', InProgress: '진행', Done: '완료' };

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

  if (error) return <div className="p-6 text-sm text-red-400">{error}</div>;
  if (!data) return <div className="p-6 text-sm text-slate-400">로딩 중...</div>;

  const { project: p, upcomingMilestones, recentChanges, recentMeetings, recentDevInfo } = data;
  const pid = p.id;

  const daysLeft = p.endDate
    ? Math.ceil((new Date(p.endDate).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div className="p-6 space-y-5">
      <div className="bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-lg font-semibold text-slate-100">{p.name}</h1>
              <ProjectStatusBadge status={p.status} />
            </div>
            {p.goal && <p className="text-sm text-slate-300">{p.goal}</p>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={async () => {
                try { await projectsApi.backup(p.id, p.name); }
                catch { alert('백업에 실패했습니다.'); }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 text-slate-200 hover:text-white rounded-md transition-colors"
              title="프로젝트 백업"
            >
              <Download size={14} /> 백업
            </button>
            {daysLeft !== null && (
              <div className={`text-right ${daysLeft < 0 ? 'text-red-400' : daysLeft < 7 ? 'text-amber-400' : 'text-emerald-400'}`}>
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
            <div key={item.label} className="border border-[#2a2a2a] rounded-md p-3">
              <p className="text-xs text-slate-400">{item.label}</p>
              <p className="text-sm text-slate-200 mt-1">{item.value}</p>
            </div>
          ))}
        </div>
        {p.description && (
          <p className="text-sm text-slate-300 mt-4 border-t border-[#2a2a2a] pt-4 whitespace-pre-wrap">{p.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="주요 마일스톤" Icon={Diamond}>
          {upcomingMilestones.length === 0 ? (
            <Empty text="예정된 마일스톤 없음" />
          ) : (
            upcomingMilestones.map((m) => (
              <div
                key={m.id}
                onClick={() => navigate(`/projects/${pid}/wbs`)}
                className="flex items-center justify-between py-2 border-b border-[#2a2a2a] last:border-0 cursor-pointer hover:bg-zinc-800/40 px-2 -mx-2 rounded"
              >
                <span className="text-sm text-slate-200">{m.name}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${wbsBadge[m.status]}`}>{wbsLabel[m.status]}</span>
                  <span className="text-xs text-slate-400">{m.endDate?.slice(0, 10)}</span>
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
                className="py-2 border-b border-[#2a2a2a] last:border-0 cursor-pointer hover:bg-zinc-800/40 px-2 -mx-2 rounded"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${impactColor[c.impact]}`}>[{c.impact}]</span>
                  <span className="text-xs text-slate-400">{c.date.slice(0, 10)}</span>
                </div>
                <p className="text-sm text-slate-300 mt-0.5 line-clamp-1">{c.content}</p>
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
                className="py-2 border-b border-[#2a2a2a] last:border-0 cursor-pointer hover:bg-zinc-800/40 px-2 -mx-2 rounded"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-200 line-clamp-1">{m.topic}</span>
                  <span className="text-xs text-slate-400 shrink-0 ml-2">{m.date.slice(0, 10)}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{attendeesToDisplay(m.attendees)}</p>
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
                className="flex items-center gap-2 py-2 border-b border-[#2a2a2a] last:border-0 cursor-pointer hover:bg-zinc-800/40 px-2 -mx-2 rounded"
              >
                <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded text-slate-300">{d.type}</span>
                <span className="text-sm text-slate-300 line-clamp-1">{d.title}</span>
              </div>
            ))
          )}
        </Section>
      </div>

      {(p.deliverables || p.relatedLinks) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {p.deliverables && (
            <Section title="주요 산출물" Icon={Package}>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{p.deliverables}</p>
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
                  className="block text-sm text-zinc-300 hover:text-white hover:underline truncate py-1"
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
    <div className="bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg p-5">
      <h2 className="text-sm font-medium text-slate-200 mb-3 flex items-center gap-2">
        <Icon size={16} className="text-slate-400" />
        {title}
      </h2>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-slate-500 py-2">{text}</p>;
}
