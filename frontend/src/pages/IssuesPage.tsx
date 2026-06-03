import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronDown, ChevronRight, FileText, Link as LinkIcon, ListTree, Plus, Search, X } from 'lucide-react';
import { issuesApi } from '../api/issues';
import { resourcesApi } from '../api/resources';
import { wbsApi } from '../api/wbs';
import { changeLogsApi } from '../api/changelogs';
import { issueWbsLinksApi, type IssueWbsLink } from '../api/issueWbsLinks';
import { Badge, Button, Card, Input, BadgeMenu, EmptyState, Skeleton, DirtyDot, inputClass, inputClassNoW, type BadgeMenuOption } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { WbsTreePicker } from '../components/WbsTreePicker';
import { issueStatusBadge, issuePriorityBadge } from '../utils/statusMaps';
import { applyTextareaTab } from '../utils/textareaTab';
import { toIsoDate } from '../utils/wbsSpan';
import { useHighlightFromQuery } from '../hooks/useHighlightFromQuery';
import { useGlobalShortcut } from '../hooks/useGlobalShortcut';
import { useCurrentProject } from '../hooks/useCurrentProject';
import type { Issue, IssueStatus, IssuePriority, IssueWbsLinkType, Resource, WbsItem } from '../types';
import { linkTypeOptions } from '../utils/issueWbsLinkType';

const STATUS_VALUES: IssueStatus[] = ['Open', 'InProgress', 'Resolved', 'Closed'];
const PRIORITY_VALUES: IssuePriority[] = ['High', 'Medium', 'Low'];

// 목록 정렬 순서: 진행 → 열림 → 해결됨 → 닫힘.
const STATUS_SORT_RANK: Record<IssueStatus, number> = {
  InProgress: 0, Open: 1, Resolved: 2, Closed: 3,
};

// 이슈 행 인라인 편집 필드 — 평상시엔 평문처럼(투명 테두리), 호버·포커스 시에만 편집칸으로 강조.
// 전역 input 스타일(surface-2 배경 + 기본 테두리)을 bg-transparent/border-transparent 로 덮어쓴다.
const ghostFieldClass =
  'w-full bg-transparent border border-transparent rounded px-1.5 py-1 transition-colors hover:border-default focus:border-default focus:bg-surface-2 focus:outline-none';

// STATUS_OPTIONS / PRIORITY_OPTIONS 는 라벨이 i18n 에 의존하므로 컴포넌트 내부에서 useMemo 로 생성한다.

export function IssuesPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = parseInt(projectId!);
  const project = useCurrentProject();
  const navigate = useNavigate();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [wbsItems, setWbsItems] = useState<WbsItem[]>([]);
  const [linkCountByIssue, setLinkCountByIssue] = useState<Map<number, number>>(new Map());
  const [sourceCountByIssue, setSourceCountByIssue] = useState<Record<number, number>>({});
  const [filter, setFilter] = useState<IssueStatus | 'All'>('All');
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | 'All'>('All');
  const [assigneeFilter, setAssigneeFilter] = useState<number | 'All' | 'Unassigned'>('All');
  const [keyword, setKeyword] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useGlobalShortcut('mod+n', () => {
    const el = document.querySelector('[data-issue-quickadd]') as HTMLInputElement | null;
    if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
  });

  // link tuple → issueId 별 카운트 Map. 0 인 issue 는 키 미포함 (배지 분기에서 falsy 처리).
  const computeLinkCounts = (links: { issueId: number }[]) => {
    const m = new Map<number, number>();
    for (const { issueId } of links) m.set(issueId, (m.get(issueId) ?? 0) + 1);
    return m;
  };

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [is, rs, ws, lks, srcCounts] = await Promise.all([
        issuesApi.getByProject(pid),
        resourcesApi.getAll(),
        wbsApi.getByProject(pid),
        issueWbsLinksApi.byProject(pid).catch(() => []),
        changeLogsApi.getSourceCounts(pid).catch(() => ({ byIssueId: {}, byWbsItemId: {} })),
      ]);
      setIssues(is);
      setResources(rs);
      setWbsItems(ws);
      setLinkCountByIssue(computeLinkCounts(lks));
      setSourceCountByIssue(srcCounts.byIssueId);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [pid]);

  // CRUD 후 issues + link 카운트 다시 fetch (로딩 깜빡임 없이). 실패는 api/client 토스트 처리.
  const refreshIssues = useCallback(() => {
    issuesApi.getByProject(pid).then(setIssues).catch(() => {});
    issueWbsLinksApi.byProject(pid).then((lks) => setLinkCountByIssue(computeLinkCounts(lks))).catch(() => {});
    changeLogsApi.getSourceCounts(pid).then((c) => setSourceCountByIssue(c.byIssueId)).catch(() => {});
  }, [pid]);

  // 펼침 행 안에서 link create/delete 후 카운트만 갱신.
  const refreshLinkCounts = useCallback(() => {
    issueWbsLinksApi.byProject(pid).then((lks) => setLinkCountByIssue(computeLinkCounts(lks))).catch(() => {});
  }, [pid]);

  useEffect(() => { load(); }, [load]);

  useHighlightFromQuery([issues.length]);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!await confirmDialog({
      title: t('issues:delete.title'),
      message: t('issues:delete.message'),
      confirmLabel: t('common:delete'),
      danger: true,
    })) return;
    await issuesApi.delete(pid, id);
    if (expanded === id) setExpanded(null);
    refreshIssues();
  };

  // 옵티미스틱 업데이트 후 백엔드에 PUT. 실패 시 원래 값으로 롤백.
  // 백엔드 PUT 은 assigneeName 을 응답으로 채우므로 페이로드에서 빼고 보낸다.
  const updateField = async <K extends keyof Issue>(id: number, key: K, value: Issue[K]) => {
    const target = issues.find((i) => i.id === id);
    if (!target || target[key] === value) return;
    const next = { ...target, [key]: value };
    setIssues((prev) => prev.map((i) => (i.id === id ? next : i)));
    const { assigneeName: _ignored, ...payload } = next;
    try {
      await issuesApi.update(pid, id, payload as Partial<Issue>);

      // Open/InProgress → Resolved/Closed 전환 시 "변경이력 추가" 토스트.
      // 한방향 트리거 (Closed → Open 은 안 뜸).
      if (key === 'status') {
        const openSet: IssueStatus[] = ['Open', 'InProgress'];
        const closedSet: IssueStatus[] = ['Resolved', 'Closed'];
        const wasOpen = openSet.includes(target.status);
        const nowClosed = closedSet.includes(value as IssueStatus);
        if (wasOpen && nowClosed) {
          toast(t('issues:toast.closed', { title: target.title }), {
            action: {
              label: t('issues:toast.addChangelog'),
              onClick: () => navigate(`/projects/${pid}/changelogs?newWithSourceIssue=${id}`),
            },
          });
        }
      }
    } catch {
      // api/client.ts 가 토스트 처리 — 여기서는 행 값만 원복.
      setIssues((prev) => prev.map((i) => (i.id === id ? target : i)));
    }
  };

  const handleQuickCreate = async () => {
    const title = newTitle.trim();
    if (!title) return;
    await issuesApi.create({
      projectId: pid,
      title,
      description: '',
      status: 'Open',
      priority: 'Medium',
      assigneeResourceId: null,
      dueDate: undefined,
      // 발생일자 기본값 = 오늘(로컬). 대개 발생 당일 등록하므로 프리필하고, 필요 시 행에서 수정.
      occurredOn: toIsoDate(Date.now()),
    });
    setNewTitle('');
    refreshIssues();
    toast.success(t('issues:toast.created', { title }));
  };

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return issues.filter((i) => {
      if (filter !== 'All' && i.status !== filter) return false;
      if (priorityFilter !== 'All' && i.priority !== priorityFilter) return false;
      if (assigneeFilter === 'Unassigned' && i.assigneeResourceId != null) return false;
      if (typeof assigneeFilter === 'number' && i.assigneeResourceId !== assigneeFilter) return false;
      if (kw) {
        const hay = `${i.title} ${i.description ?? ''}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    })
      // 상태순(진행→열림→해결됨→닫힘) 정렬. 동일 상태 내 순서는 안정 정렬로 기존(반환) 순서 유지.
      .sort((a, b) => STATUS_SORT_RANK[a.status] - STATUS_SORT_RANK[b.status]);
  }, [issues, filter, priorityFilter, assigneeFilter, keyword]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <PageHeader icon={<AlertTriangle size={18} />} breadcrumb={project?.name} title={t('issues:title')} />
        <Card padding="spacious">
          <Skeleton height={18} width="30%" />
          <div className="mt-4 space-y-2">
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={28} />)}
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <PageHeader icon={<AlertTriangle size={18} />} breadcrumb={project?.name} title={t('issues:title')} />
        <Card padding="spacious">
          <EmptyState error={error} onRetry={load} />
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <PageHeader icon={<AlertTriangle size={18} />} breadcrumb={project?.name} title={t('issues:title')} />

      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap items-center">
          <Button variant={filter === 'All' ? 'primary' : 'secondary'} size="sm" onClick={() => setFilter('All')}>
            {t('issues:filter.all', { count: issues.length })}
          </Button>
          {(['Open', 'InProgress', 'Resolved', 'Closed'] as IssueStatus[]).map((s) => {
            const count = issues.filter((i) => i.status === s).length;
            return (
              <Button
                key={s}
                variant={filter === s ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setFilter(s)}
              >
                {t(issueStatusBadge[s].labelKey)} ({count})
              </Button>
            );
          })}
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <Input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('issues:searchPlaceholder')}
            leadingIcon={<Search size={14} />}
            fullWidth={false}
            wrapperClassName="w-56"
            className="py-1.5 text-sm"
          />
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as IssuePriority | 'All')}
            className={`${inputClassNoW} py-1.5 text-sm w-32`}
          >
            <option value="All">{t('issues:filter.allPriority')}</option>
            {PRIORITY_VALUES.map((p) => (
              <option key={p} value={p}>{t(issuePriorityBadge[p].labelKey)}</option>
            ))}
          </select>
          <select
            value={String(assigneeFilter)}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'All' || v === 'Unassigned') setAssigneeFilter(v);
              else setAssigneeFilter(Number(v));
            }}
            className={`${inputClassNoW} py-1.5 text-sm w-40`}
          >
            <option value="All">{t('issues:filter.allAssignee')}</option>
            <option value="Unassigned">{t('issues:filter.unassignedOnly')}</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          {(keyword || priorityFilter !== 'All' || assigneeFilter !== 'All' || filter !== 'All') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setKeyword('');
                setPriorityFilter('All');
                setAssigneeFilter('All');
                setFilter('All');
              }}
            >
              {t('issues:filter.reset')}
            </Button>
          )}
        </div>
      </div>

      <Card padding="none" className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="text-xs text-muted border-b border-default">
              <th className="text-left py-3 px-4 font-medium w-10"></th>
              <th className="text-left py-3 px-3 font-medium">{t('issues:th.title')}</th>
              <th className="text-left py-3 px-3 font-medium w-28">{t('issues:th.status')}</th>
              <th className="text-left py-3 px-3 font-medium w-24">{t('issues:th.priority')}</th>
              <th className="text-left py-3 px-3 font-medium w-48">{t('issues:th.assignee')}</th>
              <th className="text-left py-3 px-3 font-medium w-36">{t('issues:th.occurred')}</th>
              <th className="text-left py-3 px-3 font-medium w-36">{t('issues:th.due')}</th>
              <th className="text-left py-3 px-3 font-medium w-16"></th>
            </tr>
          </thead>
          <tbody>
            {/* 상단 빈 행 — 제목 + Enter / 추가 버튼으로 빠르게 신규 생성 */}
            <tr className="bg-surface-2/30">
              <td className="py-2 px-4 text-muted">
                <Plus size={14} />
              </td>
              <td className="py-2 px-3" colSpan={6}>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleQuickCreate(); }}
                  placeholder={t('issues:quickAddPlaceholder')}
                  data-issue-quickadd
                  className="w-full bg-transparent text-sm text-primary placeholder:text-muted/70 focus:outline-none border-none px-0 py-0"
                />
              </td>
              <td className="py-2 px-3">
                <Button variant="ghost" size="sm" onClick={handleQuickCreate}>
                  {t('issues:add')}
                </Button>
              </td>
            </tr>

            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="p-0">
                  <EmptyState
                    icon={<AlertTriangle size={36} />}
                    title={t('issues:empty.title')}
                    description={
                      filter === 'All' && priorityFilter === 'All' && assigneeFilter === 'All' && !keyword
                        ? t('issues:empty.descNone')
                        : t('issues:empty.descFiltered')
                    }
                  />
                </td>
              </tr>
            )}
            {filtered.map((it) => (
              <IssueRow
                key={it.id}
                issue={it}
                resources={resources}
                wbsItems={wbsItems}
                projectId={pid}
                linkCount={linkCountByIssue.get(it.id) ?? 0}
                sourceCount={sourceCountByIssue[it.id] ?? 0}
                expanded={expanded === it.id}
                onToggleExpand={() => setExpanded((prev) => (prev === it.id ? null : it.id))}
                onUpdate={updateField}
                onDelete={handleDelete}
                onLinksChanged={refreshLinkCounts}
              />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function IssueRow({
  issue, resources, wbsItems, projectId, linkCount, sourceCount, expanded, onToggleExpand, onUpdate, onDelete, onLinksChanged,
}: {
  issue: Issue;
  resources: Resource[];
  wbsItems: WbsItem[];
  projectId: number;
  linkCount: number;
  sourceCount: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: <K extends keyof Issue>(id: number, key: K, value: Issue[K]) => void;
  onDelete: (id: number, e: React.MouseEvent) => void;
  onLinksChanged: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const STATUS_OPTIONS = useMemo<BadgeMenuOption<IssueStatus>[]>(
    () => STATUS_VALUES.map((s) => ({ value: s, label: t(issueStatusBadge[s].labelKey), variant: issueStatusBadge[s].variant })),
    [t],
  );
  const PRIORITY_OPTIONS = useMemo<BadgeMenuOption<IssuePriority>[]>(
    () => PRIORITY_VALUES.map((p) => ({ value: p, label: t(issuePriorityBadge[p].labelKey), variant: issuePriorityBadge[p].variant })),
    [t],
  );
  const [title, setTitle] = useState(issue.title);
  const [dueDate, setDueDate] = useState(issue.dueDate?.slice(0, 10) ?? '');
  const [occurredOn, setOccurredOn] = useState(issue.occurredOn?.slice(0, 10) ?? '');

  useEffect(() => { setTitle(issue.title); }, [issue.title]);
  useEffect(() => { setDueDate(issue.dueDate?.slice(0, 10) ?? ''); }, [issue.dueDate]);
  useEffect(() => { setOccurredOn(issue.occurredOn?.slice(0, 10) ?? ''); }, [issue.occurredOn]);

  return (
    <>
      <tr data-highlight-id={issue.id} className="border-b border-default last:border-0 hover:bg-surface-2 transition-colors">
        <td className="py-2 px-4">
          <button
            type="button"
            onClick={onToggleExpand}
            className="text-muted hover:text-primary transition-colors"
            title={expanded ? t('issues:row.collapse') : t('issues:row.expand')}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
        <td className="py-2 px-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => onUpdate(issue.id, 'title', title)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                title={t('issues:row.editTitle')}
                className="w-full bg-transparent text-sm text-primary font-medium focus:outline-none hover:bg-surface-3 focus:bg-surface-2 rounded pl-1.5 pr-5 py-1 transition-colors border border-transparent hover:border-default focus:border-default cursor-text"
              />
              <DirtyDot visible={title !== issue.title} className="absolute top-1/2 right-2 -translate-y-1/2" />
            </div>
            {linkCount > 0 && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="shrink-0"
                title={t('issues:row.viewLinkedWbs')}
                aria-label={t('issues:row.viewLinkedWbsAria', { count: linkCount })}
              >
                <Badge variant="neutral" size="sm" className="cursor-pointer hover:bg-accent-soft hover:text-accent transition-colors">
                  <LinkIcon size={10} className="mr-0.5" /> {linkCount}
                </Badge>
              </button>
            )}
            {sourceCount > 0 && (
              <button
                type="button"
                onClick={() => navigate(`/projects/${projectId}/changelogs?sourceIssue=${issue.id}`)}
                className="shrink-0"
                title={t('issues:row.viewSourceChangelog')}
                aria-label={t('issues:row.viewSourceChangelogAria', { count: sourceCount })}
              >
                <Badge variant="info" size="sm" className="cursor-pointer hover:bg-accent-soft hover:text-accent transition-colors">
                  <FileText size={10} className="mr-0.5" /> {sourceCount}
                </Badge>
              </button>
            )}
          </div>
        </td>
        <td className="py-2 px-3">
          <BadgeMenu<IssueStatus>
            value={issue.status}
            options={STATUS_OPTIONS}
            onChange={(next) => onUpdate(issue.id, 'status', next)}
            title={t('issues:row.changeStatus')}
          />
        </td>
        <td className="py-2 px-3">
          <BadgeMenu<IssuePriority>
            value={issue.priority}
            options={PRIORITY_OPTIONS}
            onChange={(next) => onUpdate(issue.id, 'priority', next)}
            title={t('issues:row.changePriority')}
          />
        </td>
        <td className="py-2 px-3">
          <select
            value={issue.assigneeResourceId ?? ''}
            onChange={(e) => onUpdate(issue.id, 'assigneeResourceId', e.target.value ? Number(e.target.value) : null)}
            className={`${ghostFieldClass} text-xs`}
          >
            <option value="">{t('issues:row.unassigned')}</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}{r.department ? ` (${r.department})` : ''}
              </option>
            ))}
          </select>
        </td>
        <td className="py-2 px-3">
          <div className="relative">
            <input
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              onBlur={() => onUpdate(issue.id, 'occurredOn', occurredOn || undefined)}
              className={`${ghostFieldClass} text-xs pr-6`}
            />
            <DirtyDot
              visible={occurredOn !== (issue.occurredOn?.slice(0, 10) ?? '')}
              className="absolute top-1/2 right-2 -translate-y-1/2 pointer-events-none"
            />
          </div>
        </td>
        <td className="py-2 px-3">
          <div className="relative">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              onBlur={() => onUpdate(issue.id, 'dueDate', dueDate || undefined)}
              className={`${ghostFieldClass} text-xs pr-6`}
            />
            <DirtyDot
              visible={dueDate !== (issue.dueDate?.slice(0, 10) ?? '')}
              className="absolute top-1/2 right-2 -translate-y-1/2 pointer-events-none"
            />
          </div>
        </td>
        <td className="py-2 px-3">
          <button
            onClick={(e) => onDelete(issue.id, e)}
            className="p-1 text-on-danger hover:opacity-80 transition-opacity"
            title={t('common:delete')}
          >
            <X size={14} />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-default bg-surface-2/30">
          <td />
          <td colSpan={6} className="py-3 px-3 pr-4 space-y-3">
            <div>
              <p className="text-xs text-muted font-medium mb-1">{t('issues:row.descriptionLabel')}</p>
              <DescriptionField
                value={issue.description ?? ''}
                onSave={(next) => onUpdate(issue.id, 'description', next)}
              />
            </div>
            <RelatedWbsSection issueId={issue.id} projectId={projectId} wbsItems={wbsItems} onLinksChanged={onLinksChanged} />
          </td>
        </tr>
      )}
    </>
  );
}

// 한 Issue 의 관련 WBS 링크 목록 + 추가/해제. 펼침 행 안에서 항상 마운트되므로
// 펼치는 순간 fetch. link 변동 시 부모(IssuesPage) 의 byProject 카운트도 갱신 (onLinksChanged).
function RelatedWbsSection({ issueId, projectId, wbsItems, onLinksChanged }: {
  issueId: number; projectId: number; wbsItems: WbsItem[]; onLinksChanged: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const linkOptions = useMemo(() => linkTypeOptions(t), [t]);
  const [links, setLinks] = useState<IssueWbsLink[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerType, setPickerType] = useState<IssueWbsLinkType>('RelatesTo');

  const load = () => issueWbsLinksApi.byIssue(issueId).then(setLinks).catch(() => setLinks([]));
  useEffect(() => { load(); }, [issueId]);

  const excludeIds = useMemo(() => new Set(links.map((l) => l.wbsItemId)), [links]);

  const handleAdd = async (wbsItemId: number) => {
    try {
      await issueWbsLinksApi.create(issueId, wbsItemId, pickerType);
      setPickerOpen(false);
      load();
      onLinksChanged();
    } catch { /* 토스트는 api/client.ts */ }
  };

  const handleChangeType = async (link: IssueWbsLink, next: IssueWbsLinkType) => {
    if (link.type === next) return;
    try {
      await issueWbsLinksApi.updateType(link.id, next);
      load();
    } catch { /* api/client.ts */ }
  };

  const handleRemove = async (wbsItemId: number, name: string) => {
    if (!await confirmDialog({
      title: t('issues:links.removeTitle'),
      message: t('issues:links.removeMessage', { name }),
      confirmLabel: t('issues:links.remove'),
      danger: false,
    })) return;
    await issueWbsLinksApi.delete(issueId, wbsItemId);
    load();
    onLinksChanged();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-muted font-medium flex items-center gap-1">
          <ListTree size={12} /> {t('issues:links.title', { count: links.length })}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setPickerOpen((v) => !v)} leadingIcon={<Plus size={12} />}>
          {pickerOpen ? t('common:close') : t('issues:links.add')}
        </Button>
      </div>
      {links.length === 0 && !pickerOpen ? (
        <p className="text-xs text-muted italic">{t('issues:links.empty')}</p>
      ) : (
        <ul className="space-y-1">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 bg-surface-2 border border-default rounded px-2 py-1 text-sm">
              <BadgeMenu<IssueWbsLinkType>
                value={l.type}
                options={linkOptions}
                onChange={(next) => handleChangeType(l, next)}
                title={t('issues:links.changeType')}
              />
              <button
                type="button"
                onClick={() => navigate(`/projects/${projectId}/wbs?highlight=${l.wbsItemId}`)}
                className="flex-1 text-left text-primary hover:text-accent truncate transition-colors"
              >
                {l.wbsItemName ?? `#${l.wbsItemId}`}
              </button>
              <span className="text-xs text-muted shrink-0">#{l.wbsItemId}</span>
              <button
                type="button"
                onClick={() => handleRemove(l.wbsItemId, l.wbsItemName ?? `#${l.wbsItemId}`)}
                className="p-0.5 text-on-danger hover:opacity-80 transition-opacity"
                title={t('issues:links.remove')}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {pickerOpen && (
        <>
          <div className="flex items-center gap-2 mt-2 mb-1 text-xs text-muted">
            <span>{t('issues:links.relationType')}</span>
            <select
              value={pickerType}
              onChange={(e) => setPickerType(e.target.value as IssueWbsLinkType)}
              className="bg-surface-2 border border-default rounded px-1.5 py-0.5 text-xs text-secondary"
            >
              {linkOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="h-64">
            <WbsTreePicker
              items={wbsItems}
              selectedId={null}
              excludeIds={excludeIds}
              showRoot={false}
              onSelect={(id) => { if (id != null) handleAdd(id); }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function DescriptionField({ value, onSave }: { value: string; onSave: (next: string) => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  if (editing || !value) {
    return (
      <div className="relative">
        <DirtyDot visible={editing && draft !== value} className="absolute top-2 right-2 z-10" />
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => applyTextareaTab(e, setDraft)}
          onFocus={() => setEditing(true)}
          onBlur={() => { setEditing(false); if (draft !== value) onSave(draft); }}
          rows={8}
          className={`${inputClass} resize-y font-mono`}
          placeholder={t('issues:descriptionPlaceholder')}
          autoFocus={editing}
        />
      </div>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="markdown-body min-h-[120px] cursor-text bg-surface-2 border border-default rounded-md px-3 py-2 hover:border-strong transition-colors"
    >
      <ReactMarkdown>{value}</ReactMarkdown>
    </div>
  );
}
