import { AlertTriangle, CalendarDays, Code2, ExternalLink, FileText, GitBranch, Link as LinkIcon, Network, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import type { ChangeLog, DevInfoItem, Issue, Meeting, Project, WbsItem } from '../../types';
import { parseActionItems, parseAttendees, parseDecisions } from '../../utils/meetingHelpers';

export type ProjectCounts = { wbs: number; changes: number; meetings: number; dev: number; issues: number };

export type PanelSelection =
  | { kind: 'project'; entity: Project; counts: ProjectCounts }
  | { kind: 'wbs'; entity: WbsItem }
  | { kind: 'change'; entity: ChangeLog }
  | { kind: 'meeting'; entity: Meeting }
  | { kind: 'dev'; entity: DevInfoItem }
  | { kind: 'issue'; entity: Issue };

type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'orange' | 'red';

interface Props {
  selection: PanelSelection | null;
  projectId: number;
  onClose: () => void;
}

export function MapNodePanel({ selection, projectId, onClose }: Props) {
  const navigate = useNavigate();
  const open = selection !== null;

  const openFullPage = () => {
    if (!selection) return;
    navigate(`/projects/${projectId}/${routeFor(selection.kind)}`);
  };

  return (
    <aside
      className={`absolute right-0 top-0 h-full w-[380px] bg-surface border-l border-default shadow-2xl
                  transition-transform duration-200 z-20 flex flex-col
                  ${open ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}
      aria-hidden={!open}
    >
      {selection && (
        <>
          <header className="flex items-center justify-between px-4 py-2.5 border-b border-default bg-surface-2">
            <div className="flex items-center gap-2 min-w-0">
              <KindIcon kind={selection.kind} />
              <span className="text-[11px] uppercase tracking-wider text-muted truncate">
                {kindLabel(selection.kind)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={openFullPage}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded-md text-secondary border border-default hover:bg-surface-3 hover:text-primary"
                title="전체 페이지에서 열기"
              >
                <ExternalLink size={12} /> 전체보기
              </button>
              <button
                onClick={onClose}
                className="p-1 rounded-md text-muted hover:text-primary hover:bg-surface-3"
                title="닫기 (Esc)"
                aria-label="닫기"
              >
                <X size={16} />
              </button>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {selection.kind === 'project' && <ProjectView entity={selection.entity} counts={selection.counts} />}
            {selection.kind === 'wbs' && <WbsView entity={selection.entity} />}
            {selection.kind === 'change' && <ChangeView entity={selection.entity} />}
            {selection.kind === 'meeting' && <MeetingView entity={selection.entity} />}
            {selection.kind === 'dev' && <DevView entity={selection.entity} />}
            {selection.kind === 'issue' && <IssueView entity={selection.entity} />}
          </div>
        </>
      )}
    </aside>
  );
}

function routeFor(kind: PanelSelection['kind']): string {
  switch (kind) {
    case 'project': return 'dashboard';
    case 'wbs': return 'wbs';
    case 'change': return 'changelogs';
    case 'meeting': return 'meetings';
    case 'dev': return 'devinfo';
    case 'issue': return 'issues';
  }
}

function kindLabel(kind: PanelSelection['kind']): string {
  switch (kind) {
    case 'project': return '프로젝트';
    case 'wbs': return 'WBS';
    case 'change': return '변경이력';
    case 'meeting': return '회의록';
    case 'dev': return '개발 정보';
    case 'issue': return '이슈';
  }
}

function KindIcon({ kind }: { kind: PanelSelection['kind'] }) {
  const size = 16;
  switch (kind) {
    case 'project': return <Network size={size} className="text-accent" />;
    case 'wbs': return <CalendarDays size={size} className="text-indigo-400" />;
    case 'change': return <GitBranch size={size} className="text-orange-400" />;
    case 'meeting': return <FileText size={size} className="text-emerald-400" />;
    case 'dev': return <Code2 size={size} className="text-cyan-400" />;
    case 'issue': return <AlertTriangle size={size} className="text-rose-400" />;
  }
}

function ProjectView({ entity, counts }: { entity: Project; counts: ProjectCounts }) {
  return (
    <>
      <h2 className="text-base font-semibold text-primary">{entity.name}</h2>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={projectStatusTone(entity.status)}>{entity.status}</Badge>
        {(entity.startDate || entity.endDate) && (
          <span className="text-xs text-muted">
            {entity.startDate?.slice(0, 10) ?? '-'} ~ {entity.endDate?.slice(0, 10) ?? '-'}
          </span>
        )}
      </div>
      {entity.goal && (
        <Section label="목표">
          <p className="text-sm text-secondary whitespace-pre-wrap">{entity.goal}</p>
        </Section>
      )}
      {entity.description && (
        <Section label="설명">
          <p className="text-sm text-secondary whitespace-pre-wrap">{entity.description}</p>
        </Section>
      )}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Stat label="WBS" value={counts.wbs} />
        <Stat label="변경이력" value={counts.changes} />
        <Stat label="회의록" value={counts.meetings} />
        <Stat label="개발 정보" value={counts.dev} />
        <Stat label="이슈" value={counts.issues} />
      </div>
    </>
  );
}

function IssueView({ entity }: { entity: Issue }) {
  return (
    <>
      <h2 className="text-base font-semibold text-primary">{entity.title}</h2>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={priorityTone(entity.priority)}>{entity.priority}</Badge>
        <Badge tone={issueStatusTone(entity.status)}>{entity.status}</Badge>
        {entity.dueDate && (
          <span className="text-xs text-muted">마감 {entity.dueDate.slice(0, 10)}</span>
        )}
      </div>
      {entity.assigneeName && <KV label="담당" value={entity.assigneeName} />}
      {entity.description && (
        <Section label="설명">
          <p className="text-sm text-secondary whitespace-pre-wrap">{entity.description}</p>
        </Section>
      )}
    </>
  );
}

function WbsView({ entity }: { entity: WbsItem }) {
  return (
    <>
      <h2 className="text-base font-semibold text-primary flex items-start gap-2">
        {entity.isMilestone && <span className="text-accent-2 leading-none mt-0.5">◆</span>}
        <span className="flex-1">{entity.name}</span>
      </h2>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={wbsStatusTone(entity.status)}>{entity.status}</Badge>
        {entity.isMilestone && <Badge tone="amber">마일스톤</Badge>}
      </div>
      <KV label="담당" value={entity.assignee || '-'} />
      <KV
        label="기간"
        value={`${entity.startDate?.slice(0, 10) ?? '-'} ~ ${entity.endDate?.slice(0, 10) ?? '-'}`}
      />
      {entity.notes && (
        <Section label="메모">
          <p className="text-sm text-secondary whitespace-pre-wrap">{entity.notes}</p>
        </Section>
      )}
    </>
  );
}

function ChangeView({ entity }: { entity: ChangeLog }) {
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={impactTone(entity.impact)}>{entity.impact}</Badge>
        <span className="text-xs text-muted">{entity.date.slice(0, 10)}</span>
      </div>
      {entity.createdBy && <KV label="작성자" value={entity.createdBy} />}
      {entity.updatedBy && entity.updatedBy !== entity.createdBy && (
        <KV label="최근 수정자" value={entity.updatedBy} />
      )}
      <Section label="변경 내용">
        <div className="markdown-body">
          <ReactMarkdown>{entity.content}</ReactMarkdown>
        </div>
      </Section>
      {entity.relatedDocLinks && (
        <Section label="관련 문서">
          <p className="text-xs text-secondary break-all">{entity.relatedDocLinks}</p>
        </Section>
      )}
    </>
  );
}

function MeetingView({ entity }: { entity: Meeting }) {
  const attendees = parseAttendees(entity.attendees);
  const decisions = parseDecisions(entity.decisions);
  const actions = parseActionItems(entity.actionItems);
  return (
    <>
      <h2 className="text-base font-semibold text-primary">{entity.topic}</h2>
      <div className="text-xs text-muted">{entity.date.slice(0, 10)}</div>
      {attendees.length > 0 ? (
        <Section label="참석자">
          <div className="space-y-1">
            {attendees.map((a, i) => (
              <div key={i} className="text-sm text-secondary">
                <span className="text-muted">{a.org}: </span>
                {a.members.join(', ')}
              </div>
            ))}
          </div>
        </Section>
      ) : entity.attendees ? (
        <KV label="참석자" value={entity.attendees} />
      ) : null}
      {decisions.length > 0 && (
        <Section label="결정사항">
          <ul className="list-disc pl-5 space-y-0.5 text-sm text-secondary">
            {decisions.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </Section>
      )}
      {actions.length > 0 && (
        <Section label="액션 아이템">
          <ul className="space-y-1.5 text-sm text-secondary">
            {actions.map((a, i) => (
              <li key={i} className="bg-surface-2 border border-default rounded px-2 py-1.5">
                <div>{a.content}</div>
                {(a.assignee || a.deadline) && (
                  <div className="text-[11px] text-muted mt-0.5">
                    {a.assignee && <span>담당: {a.assignee}</span>}
                    {a.assignee && a.deadline && <span> · </span>}
                    {a.deadline && <span>마감: {a.deadline}</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {entity.discussion && (
        <Section label="논의">
          <p className="text-sm text-secondary whitespace-pre-wrap">{entity.discussion}</p>
        </Section>
      )}
    </>
  );
}

function DevView({ entity }: { entity: DevInfoItem }) {
  return (
    <>
      <h2 className="text-base font-semibold text-primary">{entity.title}</h2>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone="blue">{entity.type}</Badge>
        {entity.tags && <span className="text-xs text-muted">{entity.tags}</span>}
      </div>
      {entity.type === 'Markdown' && entity.content && (
        <div className="markdown-body">
          <ReactMarkdown>{entity.content}</ReactMarkdown>
        </div>
      )}
      {entity.type === 'File' && entity.filePath && (
        <Section label="파일 경로">
          <code className="text-xs break-all">{entity.filePath}</code>
        </Section>
      )}
      {entity.type === 'Link' && entity.url && (
        <a
          href={entity.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-accent hover:underline break-all"
        >
          <LinkIcon size={14} /> {entity.url}
        </a>
      )}
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted mb-1">{label}</div>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted mb-0.5">{label}</div>
      <div className="text-sm text-secondary">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface-2 border border-default rounded px-3 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-lg font-semibold text-primary leading-tight">{value}</div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: Tone }) {
  const toneMap: Record<Tone, string> = {
    gray: 'bg-zinc-700/40 text-zinc-200 border-zinc-600/60',
    blue: 'bg-blue-700/30 text-blue-200 border-blue-600/40',
    green: 'bg-emerald-700/30 text-emerald-200 border-emerald-600/40',
    amber: 'bg-amber-700/30 text-amber-200 border-amber-600/40',
    orange: 'bg-orange-700/30 text-orange-200 border-orange-600/40',
    red: 'bg-red-700/30 text-red-200 border-red-600/40',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border ${toneMap[tone]}`}>
      {children}
    </span>
  );
}

function projectStatusTone(s: string): Tone {
  switch (s) {
    case 'Planned': return 'gray';
    case 'Waiting': return 'amber';
    case 'InProgress': return 'blue';
    case 'Done': return 'green';
    default: return 'gray';
  }
}

function wbsStatusTone(s: string): Tone {
  switch (s) {
    case 'Planned': return 'gray';
    case 'InProgress': return 'blue';
    case 'Done': return 'green';
    default: return 'gray';
  }
}

function impactTone(s: string): Tone {
  switch (s) {
    case 'Low': return 'green';
    case 'Medium': return 'amber';
    case 'High': return 'orange';
    case 'Critical': return 'red';
    default: return 'gray';
  }
}

function priorityTone(s: string): Tone {
  switch (s) {
    case 'Low': return 'green';
    case 'Medium': return 'amber';
    case 'High': return 'red';
    default: return 'gray';
  }
}

function issueStatusTone(s: string): Tone {
  switch (s) {
    case 'Open': return 'red';
    case 'InProgress': return 'blue';
    case 'Resolved': return 'green';
    case 'Closed': return 'gray';
    default: return 'gray';
  }
}
