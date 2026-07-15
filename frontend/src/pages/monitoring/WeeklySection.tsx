import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { NotebookPen, Download, Calendar, AlertCircle } from 'lucide-react';
import { Markdown } from '../../components/ui/Markdown';
import { Button, Card, Badge, Spinner } from '../../components/ui';
import type {
  NextWeekPlanByProject,
  OpenIssuesByProject,
  WeeklyReview,
  WeeklyWorkLog,
  WeeklyWorkLogDay,
  WeeklyWorkLogProject,
} from '../../types';

// 통합 모니터링 '일지' 탭의 주간 업무일지 뷰. props 로만 동작하는 프레젠테이션 컴포넌트라
// MonitoringPage 밖(업무일지 화면 모달 등)에서도 그대로 재사용한다. 데이터 로딩은 호출자 책임.

// 통합 모니터링에는 '한 일'·'이슈'만 노출한다. '계획' 은 프로젝트별 업무일지에서 본다.
type WorkLogField = 'done' | 'issues';
const FIELD_DEFS: { key: WorkLogField; labelKey: string }[] = [
  { key: 'done',   labelKey: 'monitoring:fields.done' },
  { key: 'issues', labelKey: 'monitoring:fields.issues' },
];

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// 회고 다이제스트 섹션 — 완료한 항목 / 놓친 마감 / 다음 주 예정. md 내보내기 상단에 첨부.
function buildReviewMarkdown(review: WeeklyReview, t: TFunction): string {
  const due = t('monitoring:markdown.due');
  const lines: string[] = [`## ${t('monitoring:markdown.reviewHeading')}`, ''];
  const section = (heading: string, items: string[]) => {
    lines.push(`### ${heading} (${items.length})`);
    if (items.length === 0) lines.push(`- _${t('monitoring:markdown.none')}_`);
    else lines.push(...items);
    lines.push('');
  };
  section(t('monitoring:markdown.completed'), review.completed.map((c) => `- [${c.projectName}] ${c.title} (${c.completedAt})`));
  section(t('monitoring:markdown.missed'), review.missedDeadlines.map((d) => `- [${d.projectName}] ${d.title} — ${due} ${d.dueDate}`));
  section(t('monitoring:markdown.upcoming'), review.upcomingNextWeek.map((d) => `- [${d.projectName}] ${d.title} — ${due} ${d.dueDate}`));
  return lines.join('\n');
}

function buildWeeklyMarkdown(data: WeeklyWorkLog, t: TFunction, openIssues: OpenIssuesByProject[] = [], review: WeeklyReview | null = null, plan: NextWeekPlanByProject[] = []): string {
  const weekStart = data.weekStart.slice(0, 10);
  // 종료일 = 주 시작 + 4일 (월~금)
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 4);
  const endIso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

  const fields: { key: 'done' | 'issues'; label: string }[] = [
    { key: 'done',   label: t('monitoring:fields.done') },
    { key: 'issues', label: t('monitoring:fields.issues') },
  ];

  const lines: string[] = [];
  lines.push(`# ${t('monitoring:markdown.worklogTitle')} (${weekStart} ~ ${endIso})`);
  lines.push('');

  if (review) {
    lines.push(buildReviewMarkdown(review, t));
    lines.push('');
  }

  if (data.projects.length === 0) {
    lines.push(`_${t('monitoring:markdown.noRecord')}_`);
    lines.push('');
  } else {
    for (const p of data.projects) {
      lines.push(`## ${p.projectName}`);
      lines.push('');
      for (const d of p.days) {
        const hasAny = fields.some((f) => (d[f.key] ?? '').trim() !== '');
        if (!hasAny) continue;
        const dateShort = d.date.slice(5, 10).replace('-', '/');
        lines.push(`### ${d.dayLabel} (${dateShort})`);
        for (const f of fields) {
          const val = (d[f.key] ?? '').trim();
          if (!val) continue;
          lines.push(`**${f.label}**:`);
          lines.push('');
          lines.push(val);
          lines.push('');
        }
      }
    }
  }

  // 미해결 이슈 스냅샷 — '[프로젝트명] 이슈이름 - 이슈설명'.
  const issueLines = openIssues.flatMap((p) =>
    p.issues.map((i) => {
      const desc = oneLine(i.description);
      return `- [${p.projectName}] ${i.title}${desc ? ` - ${desc}` : ''}`;
    }),
  );
  if (issueLines.length > 0) {
    lines.push(`## ${t('monitoring:markdown.issuesTitle')}`);
    lines.push('');
    lines.push(...issueLines);
    lines.push('');
  }

  // 다음 주 계획 — '[프로젝트명] 제목 — 시작/마감 날짜 (담당자)'.
  const planLines = plan.flatMap((p) =>
    p.items.map((it) => {
      const reason = it.reason === 'start' ? t('monitoring:markdown.planStart') : t('monitoring:markdown.planDue');
      const who = it.assigneeName ? ` (${it.assigneeName})` : '';
      return `- [${p.projectName}] ${it.title} — ${reason} ${it.date}${who}`;
    }),
  );
  if (planLines.length > 0) {
    lines.push(`## ${t('monitoring:markdown.planTitle')}`);
    lines.push('');
    lines.push(...planLines);
    lines.push('');
  }
  return lines.join('\n');
}

function downloadWeeklyMarkdown(data: WeeklyWorkLog, t: TFunction, openIssues: OpenIssuesByProject[] = [], review: WeeklyReview | null = null, plan: NextWeekPlanByProject[] = []) {
  const md = buildWeeklyMarkdown(data, t, openIssues, review, plan);
  const weekStart = data.weekStart.slice(0, 10);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `worklog-${weekStart}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type WeeklyVariant = 'current' | 'muted';

export function WeeklySection({
  title, data, loading, onProjectClick, variant = 'current', exportable = false, openIssues = [], review = null, plan = [],
}: {
  title: string;
  data: WeeklyWorkLog | null;
  loading: boolean;
  onProjectClick: (id: number) => void;
  variant?: WeeklyVariant;
  exportable?: boolean;
  openIssues?: OpenIssuesByProject[];
  review?: WeeklyReview | null;
  plan?: NextWeekPlanByProject[];
}) {
  const { t } = useTranslation();
  const muted = variant === 'muted';
  const titleCls = muted ? 'text-secondary' : 'text-primary';
  const iconCls = muted ? 'text-muted' : 'text-accent';
  const reviewHasContent = !!review
    && review.completed.length + review.missedDeadlines.length + review.upcomingNextWeek.length > 0;
  const planHasContent = plan.some((p) => p.items.length > 0);
  const hasLogs = !!data && data.projects.length > 0;
  const canExport = exportable && !!data && (hasLogs || reviewHasContent || planHasContent);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className={`h-section flex items-center gap-2 ${titleCls}`}>
          <NotebookPen size={16} className={iconCls} />
          {title}
          {data && (
            <span className="text-xs text-muted font-normal">
              {t('monitoring:weekSuffix', { date: data.weekStart.slice(0, 10) })}
            </span>
          )}
        </h2>
        {canExport && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadWeeklyMarkdown(data!, t, openIssues, review, plan)}
            leadingIcon={<Download size={14} />}
            title={t('monitoring:logs.exportTitle')}
          >
            {t('monitoring:logs.export')}
          </Button>
        )}
      </div>
      {loading ? (
        <Spinner label={t('common:loading')} />
      ) : (
        <div className="space-y-3">
          {hasLogs ? (
            data!.projects.map((p) => (
              <ProjectWeekCard key={p.projectId} project={p} onProjectClick={onProjectClick} variant={variant} />
            ))
          ) : (
            <Card padding="spacious" variant={muted ? 'subtle' : 'default'} className="text-center text-muted text-sm">
              {t('monitoring:logs.noRecord')}
            </Card>
          )}
          {planHasContent && <NextWeekPlanBlock plan={plan} onProjectClick={onProjectClick} />}
        </div>
      )}
    </section>
  );
}

// 다음 주 계획 — 프로젝트별 다음 주 시작/마감 예정 작업·이슈. '이번 주' 주간 병합에 첨부.
function NextWeekPlanBlock({ plan, onProjectClick }: {
  plan: NextWeekPlanByProject[];
  onProjectClick: (id: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card padding="normal" variant="subtle">
      <p className="h-section flex items-center gap-2 text-primary mb-2">
        <Calendar size={16} className="text-accent" />
        {t('monitoring:logs.planTitle')}
      </p>
      <div className="space-y-3">
        {plan.map((p) => (
          <div key={p.projectId}>
            <button
              onClick={() => onProjectClick(p.projectId)}
              className="text-sm font-bold text-primary hover:text-accent transition-colors"
            >
              {p.projectName}
            </button>
            <ul className="mt-1 space-y-1">
              {p.items.map((it) => (
                <li key={`${it.kind}-${it.id}`} className="text-sm text-secondary flex flex-wrap items-baseline gap-x-1.5">
                  <Badge variant={it.reason === 'start' ? 'accent' : 'warning'} size="sm">
                    {it.reason === 'start' ? t('monitoring:logs.planStart') : t('monitoring:logs.planDue')}
                  </Badge>
                  <span className="font-medium text-primary">{it.title}</span>
                  <span className="text-muted">{it.date}</span>
                  {it.assigneeName && <Badge variant="neutral" size="sm">{it.assigneeName}</Badge>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ProjectWeekCard({
  project, onProjectClick, variant = 'current',
}: {
  project: WeeklyWorkLogProject;
  onProjectClick: (id: number) => void;
  variant?: WeeklyVariant;
}) {
  const { t } = useTranslation();
  return (
    <Card padding="normal" variant={variant === 'muted' ? 'subtle' : 'default'} className={variant === 'muted' ? 'opacity-90' : ''}>
      <button
        onClick={() => onProjectClick(project.projectId)}
        className="text-base font-bold text-primary hover:text-accent transition-colors"
      >
        {project.projectName}
      </button>
      <div className="mt-2 space-y-3">
        {FIELD_DEFS.map((f) => {
          const daysWithContent = project.days.filter((d) => (d[f.key] ?? '').trim() !== '');
          if (daysWithContent.length === 0) return null;
          return (
            <div key={f.key}>
              <p className="text-xs text-accent font-medium mb-1">{t(f.labelKey)}</p>
              <div className="pl-2 space-y-2">
                {daysWithContent.map((d) => (
                  <DayBlock key={d.dayIndex} day={d} field={f.key} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DayBlock({ day, field }: { day: WeeklyWorkLogDay; field: WorkLogField }) {
  return (
    <div>
      <p className="text-xs font-semibold text-secondary">{day.dayLabel}</p>
      <div className="markdown-body pl-3"><Markdown>{day[field]}</Markdown></div>
    </div>
  );
}

// 미해결(Open·InProgress) 이슈를 프로젝트별로 묶어 보여주는 섹션. md 내보내기엔 '이번 주' 일지에 첨부됨.
export function OpenIssuesSection({
  openIssues, loading, onProjectClick,
}: {
  openIssues: OpenIssuesByProject[];
  loading: boolean;
  onProjectClick: (id: number) => void;
}) {
  const { t } = useTranslation();
  const total = openIssues.reduce((n, p) => n + p.issues.length, 0);
  return (
    <section className="space-y-3">
      <h2 className="h-section flex items-center gap-2 text-primary">
        <AlertCircle size={16} className="text-accent" />
        {t('monitoring:logs.issuesTitle')}
        <span className="text-xs text-muted font-normal">{t('monitoring:logs.openCount', { count: total })}</span>
      </h2>
      {loading ? (
        <Spinner label={t('common:loading')} />
      ) : openIssues.length === 0 ? (
        <Card padding="spacious" className="text-center text-muted text-sm">
          {t('monitoring:logs.noOpenIssues')}
        </Card>
      ) : (
        <div className="space-y-3">
          {openIssues.map((p) => (
            <Card key={p.projectId} padding="normal">
              <button
                onClick={() => onProjectClick(p.projectId)}
                className="text-base font-bold text-primary hover:text-accent transition-colors"
              >
                {p.projectName}
              </button>
              <ul className="mt-2 space-y-1">
                {p.issues.map((i) => (
                  <li key={i.id} className="text-sm text-secondary flex flex-wrap items-baseline gap-x-1.5">
                    <span className="font-medium text-primary">{i.title}</span>
                    {i.description.trim() && (
                      <span className="text-muted">- {i.description.replace(/\s+/g, ' ').trim()}</span>
                    )}
                    {i.assigneeName && (
                      <Badge variant="neutral" size="sm">{i.assigneeName}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
