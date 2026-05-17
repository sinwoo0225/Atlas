import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { Plus, Pencil, X, Save, Diamond, ChevronDown, ChevronRight, CalendarDays, Search, ListChecks, Link as LinkIcon, FileText } from 'lucide-react';
import { wbsApi } from '../api/wbs';
import { resourcesApi } from '../api/resources';
import { changeLogsApi } from '../api/changelogs';
import { Button, Card, Modal, Badge, BadgeMenu, EmptyState, Skeleton, DirtyDot, FormField, inputClass } from '../components/ui';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { AssigneeTagInput } from '../components/AssigneeTagInput';
import { applyTextareaTab } from '../utils/textareaTab';
import { wbsImportanceBadge } from '../utils/statusMaps';
import {
  collectDescendantIds, collectMatchedIds, filterWbsTree, findItemName,
  hasAnyFilter, type WbsFilterOpts,
} from '../utils/wbsHelpers';
import { WbsTreePicker } from '../components/WbsTreePicker';
import { IssuePicker } from '../components/IssuePicker';
import { issuesApi } from '../api/issues';
import { issueWbsLinksApi, type IssueWbsLink } from '../api/issueWbsLinks';
import { GanttChart } from './wbs/GanttChart';
import { useHighlightFromQuery } from '../hooks/useHighlightFromQuery';
import type { WbsItem, WbsVersion, Resource, WbsStatus, Issue } from '../types';

function patchStatus(items: WbsItem[], id: number, status: WbsStatus): WbsItem[] {
  return items.map((it) => {
    if (it.id === id) return { ...it, status };
    if (it.children?.length) return { ...it, children: patchStatus(it.children, id, status) };
    return it;
  });
}

type WbsFormData = {
  name: string; assignee: string; startDate: string; endDate: string;
  status: string; isMilestone: boolean; order: string; notes: string;
  parentId: number | null;
};

function WbsItemForm({
  projectId, versionId, parentId, initial, resources, allItems, allIssues,
  onRefreshIssues, onLinksChanged, onSave, onCancel,
}: {
  projectId: number; versionId?: number; parentId?: number;
  initial?: WbsItem; resources: Resource[]; allItems: WbsItem[]; allIssues: Issue[];
  onRefreshIssues: () => void;
  onLinksChanged: () => void;
  onSave: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState<WbsFormData>({
    name: initial?.name ?? '',
    assignee: initial?.assignee ?? '',
    startDate: initial?.startDate?.slice(0, 10) ?? '',
    endDate: initial?.endDate?.slice(0, 10) ?? '',
    status: initial?.status ?? 'Planned',
    isMilestone: initial?.isMilestone ?? false,
    order: (initial?.order ?? 2).toString(),
    notes: initial?.notes ?? '',
    parentId: initial?.parentId ?? parentId ?? null,
  });
  const [notesEditing, setNotesEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const set = <K extends keyof WbsFormData>(k: K, v: WbsFormData[K]) => setForm((f) => ({ ...f, [k]: v }));

  // 자기 자신 + 자손은 부모 picker 에서 비활성. 신규(create) 는 자기 자신이 없으므로 빈 Set.
  const excludeIds = useMemo(
    () => initial ? collectDescendantIds(initial.id, allItems) : new Set<number>(),
    [initial, allItems],
  );
  const descendantCount = useMemo(
    () => initial ? Math.max(0, collectDescendantIds(initial.id, allItems).size - 1) : 0,
    [initial, allItems],
  );

  const handleSubmit = async () => {
    const payload = {
      projectId, versionId: versionId ?? null, parentId: form.parentId,
      name: form.name, assignee: form.assignee,
      startDate: form.startDate || null, endDate: form.endDate || null,
      status: form.status as any, isMilestone: form.isMilestone,
      order: parseInt(form.order) || 0, notes: form.notes,
    };
    if (initial) {
      const parentChanged = (initial.parentId ?? null) !== form.parentId;
      await wbsApi.update(projectId, initial.id, payload as any);
      if (parentChanged) {
        const target = findItemName(form.parentId, allItems);
        toast.success(
          descendantCount > 0
            ? `'${initial.name}' 을(를) '${target}' 아래로 이동 (하위 ${descendantCount}건 포함)`
            : `'${initial.name}' 을(를) '${target}' 아래로 이동`,
        );
      }
    } else {
      await wbsApi.create(payload as any);
      toast.success(`새 작업 '${form.name}' 이(가) 추가됐어요`);
    }
    onSave();
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title={initial ? '작업 수정' : '작업 추가'}
      size="xl"
      fixedHeight
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>취소</Button>
          <Button variant="primary" onClick={handleSubmit} leadingIcon={<Save size={16} />}>저장</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
          {/* 좌측 - 기본 필드. picker 펼침 시 picker 영역이 남은 공간 다 차지 (flex-1). */}
          <div className="flex flex-col gap-3 min-h-0">
            <FormField label="작업명" required>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
            </FormField>
            <FormField label="담당자 (여러 명: Enter / 콤마로 구분)">
              <AssigneeTagInput
                value={form.assignee}
                onChange={(v) => set('assignee', v)}
                resources={resources}
                placeholder="이름 입력 후 Enter / 콤마, 또는 목록에서 선택"
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="시작일">
                <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputClass} />
              </FormField>
              <FormField label="종료일">
                <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className={inputClass} />
              </FormField>
            </div>
            <FormField label="중요도">
              <select value={form.order} onChange={(e) => set('order', e.target.value)} className={inputClass}>
                <option value="3">높음</option>
                <option value="2">중간</option>
                <option value="1">낮음</option>
              </select>
            </FormField>
            <FormField label="상태">
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputClass}>
                <option value="Planned">예정</option>
                <option value="InProgress">진행</option>
                <option value="Done">완료</option>
              </select>
            </FormField>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isMilestone} onChange={(e) => set('isMilestone', e.target.checked)} className="rounded" />
              <span className="text-sm text-secondary">마일스톤</span>
            </label>
            {initial && (
              <FormField label="부모 작업" className={pickerOpen ? 'flex-1 min-h-0' : 'shrink-0'}>
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  className={`${inputClass} text-left flex items-center justify-between shrink-0`}
                >
                  <span className={form.parentId == null ? 'text-muted' : 'text-primary'}>
                    {findItemName(form.parentId, allItems)}
                  </span>
                  {pickerOpen ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
                </button>
                {pickerOpen && (
                  <div className="mt-2 flex-1 min-h-0 flex flex-col gap-1">
                    <div className="flex-1 min-h-0">
                      <WbsTreePicker
                        items={allItems}
                        selectedId={form.parentId}
                        excludeIds={excludeIds}
                        onSelect={(id) => { set('parentId', id); setPickerOpen(false); }}
                      />
                    </div>
                    {descendantCount > 0 && (
                      <p className="text-xs text-muted shrink-0">
                        이 항목에는 하위 작업 {descendantCount}건이 있습니다. 부모를 변경하면 함께 이동됩니다.
                      </p>
                    )}
                  </div>
                )}
              </FormField>
            )}
          </div>

          {/* 우측 - 관련 Issue (수정 시) + 상세 정보 (마크다운). 마크다운이 세로 가득. */}
          <div className="flex flex-col min-h-0 gap-3">
            {initial && (
              <RelatedIssuesSection
                wbsItemId={initial.id}
                projectId={projectId}
                allIssues={allIssues}
                onRefreshIssues={onRefreshIssues}
                onLinksChanged={onLinksChanged}
              />
            )}
            <FormField label="상세 정보 (마크다운, 포커스 아웃 시 렌더링)" className="min-h-0 flex-1">
              {notesEditing || !form.notes ? (
                <div className="relative flex-1 min-h-0 flex flex-col">
                  <DirtyDot
                    visible={form.notes !== (initial?.notes ?? '')}
                    className="absolute top-2 right-2 z-10 pointer-events-none"
                  />
                  <textarea
                    value={form.notes}
                    onChange={(e) => set('notes', e.target.value)}
                    onKeyDown={(e) => applyTextareaTab(e, (next) => set('notes', next))}
                    onFocus={() => setNotesEditing(true)}
                    onBlur={() => setNotesEditing(false)}
                    className={`${inputClass} resize-none font-mono flex-1 min-h-0`}
                    placeholder="작업에 대한 상세 정보 (마크다운 지원)"
                    autoFocus={notesEditing}
                  />
                </div>
              ) : (
                <div
                  onClick={() => setNotesEditing(true)}
                  className="markdown-body flex-1 min-h-0 overflow-y-auto cursor-text bg-surface-2 border border-default rounded-md px-3 py-2 hover:border-strong transition-colors"
                >
                  <ReactMarkdown>{form.notes}</ReactMarkdown>
                </div>
              )}
            </FormField>
          </div>
        </div>
    </Modal>
  );
}

// WBS 항목의 관련 Issue 링크 목록 + 추가/해제. 모달 펼침 시 fetch.
// picker 열 때마다 issues silent refetch (다른 탭에서 만든 새 Issue 즉시 반영).
// link 변동 시 부모(WbsPage) 의 byProject 카운트도 갱신 (onLinksChanged).
function RelatedIssuesSection({ wbsItemId, projectId, allIssues, onRefreshIssues, onLinksChanged }: {
  wbsItemId: number; projectId: number; allIssues: Issue[];
  onRefreshIssues: () => void;
  onLinksChanged: () => void;
}) {
  const navigate = useNavigate();
  const [links, setLinks] = useState<IssueWbsLink[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = () => issueWbsLinksApi.byWbs(wbsItemId).then(setLinks).catch(() => setLinks([]));
  useEffect(() => { load(); }, [wbsItemId]);

  const excludeIds = useMemo(() => new Set(links.map((l) => l.issueId)), [links]);

  const togglePicker = () => {
    setPickerOpen((v) => {
      const next = !v;
      if (next) onRefreshIssues();
      return next;
    });
  };

  const handleAdd = async (issueId: number) => {
    try {
      await issueWbsLinksApi.create(issueId, wbsItemId);
      setPickerOpen(false);
      load();
      onLinksChanged();
    } catch { /* api/client.ts 가 토스트 처리 */ }
  };

  const handleRemove = async (issueId: number, title: string) => {
    if (!await confirmDialog({
      title: '연결 해제',
      message: `'${title}' 과(와) 의 연결을 해제하시겠습니까?`,
      confirmLabel: '해제',
    })) return;
    await issueWbsLinksApi.delete(issueId, wbsItemId);
    load();
    onLinksChanged();
  };

  return (
    <div className={pickerOpen ? 'flex flex-col min-h-0 gap-1 flex-1' : 'shrink-0 flex flex-col gap-1'}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted font-medium flex items-center gap-1">
          <ListChecks size={12} /> 관련 Issue ({links.length})
        </p>
        <Button variant="ghost" size="sm" onClick={togglePicker} leadingIcon={<Plus size={12} />}>
          {pickerOpen ? '닫기' : '연결 추가'}
        </Button>
      </div>
      {links.length === 0 && !pickerOpen ? (
        <p className="text-xs text-muted italic">연결된 Issue 없음</p>
      ) : (
        <ul className="space-y-1">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 bg-surface-2 border border-default rounded px-2 py-1 text-sm">
              <button
                type="button"
                onClick={() => navigate(`/projects/${projectId}/issues?highlight=${l.issueId}`)}
                className="flex-1 text-left text-primary hover:text-accent truncate transition-colors"
              >
                {l.issueTitle ?? `#${l.issueId}`}
              </button>
              <span className="text-xs text-muted shrink-0">#{l.issueId}</span>
              <button
                type="button"
                onClick={() => handleRemove(l.issueId, l.issueTitle ?? `#${l.issueId}`)}
                className="p-0.5 text-on-danger hover:opacity-80 transition-opacity"
                title="해제"
                aria-label={`이슈 연결 해제 — ${l.issueTitle ?? `#${l.issueId}`}`}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {pickerOpen && (
        <div className="mt-1 flex-1 min-h-0">
          <IssuePicker
            items={allIssues}
            excludeIds={excludeIds}
            onSelect={handleAdd}
          />
        </div>
      )}
    </div>
  );
}

function DateEditModal({
  item,
  projectId,
  onSave,
  onCancel,
}: {
  item: WbsItem;
  projectId: number;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [start, setStart] = useState(item.startDate?.slice(0, 10) ?? '');
  const [end, setEnd] = useState(item.endDate?.slice(0, 10) ?? '');

  const handleSave = async () => {
    await wbsApi.update(projectId, item.id, {
      ...item,
      startDate: start || undefined,
      endDate: end || undefined,
    });
    onSave();
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title={`날짜 수정 — ${item.name}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>취소</Button>
          <Button variant="primary" onClick={handleSave} leadingIcon={<Save size={16} />}>저장</Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="시작일">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="종료일">
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
        </FormField>
      </div>
    </Modal>
  );
}

function WbsRow({ item, projectId, depth = 0, matchedIds, linkCountByWbs, sourceCountByWbs, onEdit, onDelete, onAddChild, onStatusChange }: {
  item: WbsItem; projectId: number; depth?: number;
  matchedIds?: Set<number>;
  linkCountByWbs: Map<number, number>;
  sourceCountByWbs: Record<number, number>;
  onEdit: (item: WbsItem) => void; onDelete: (id: number) => void;
  onAddChild: (parentId: number) => void;
  onStatusChange: (item: WbsItem, status: WbsStatus) => void;
}) {
  const navigate = useNavigate();
  const linkCount = linkCountByWbs.get(item.id) ?? 0;
  const sourceCount = sourceCountByWbs[item.id] ?? 0;
  const [expanded, setExpanded] = useState(true);
  const hasChildren = (item.children?.length ?? 0) > 0;
  const importance = wbsImportanceBadge(item.order);
  // matchedIds 가 비어 있으면 (필터 없음) 강조 안 함. 있으면 매칭 행만 accent-soft 배경.
  const isMatched = matchedIds && matchedIds.size > 0 && matchedIds.has(item.id);

  return (
    <>
      <tr
        data-highlight-id={item.id}
        className={`border-b border-default hover:bg-surface-2 transition-colors ${isMatched ? 'bg-accent-soft' : ''}`}
        onDoubleClick={() => onEdit(item)}
      >
        <td className="py-2 px-4">
          <div className="flex items-center gap-1" style={{ paddingLeft: depth * 20 }}>
            {hasChildren ? (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-muted hover:text-primary transition-colors"
                aria-label={expanded ? `${item.name} 접기` : `${item.name} 펼치기`}
                aria-expanded={expanded}
              >
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            ) : (
              <span className="w-4 inline-block" />
            )}
            {item.isMilestone && <Diamond size={12} className="text-accent" />}
            <span
              className="text-sm text-primary hover:text-accent cursor-pointer transition-colors"
              onClick={() => onEdit(item)}
            >
              {item.name}
            </span>
            {linkCount > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                className="ml-1 shrink-0"
                title="관련 Issue 보기"
                aria-label={`관련 Issue ${linkCount}건 보기`}
              >
                <Badge variant="neutral" size="sm" className="cursor-pointer hover:bg-accent-soft hover:text-accent transition-colors">
                  <LinkIcon size={10} className="mr-0.5" /> {linkCount}
                </Badge>
              </button>
            )}
            {sourceCount > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); navigate(`/projects/${projectId}/changelogs?sourceWbs=${item.id}`); }}
                className="ml-1 shrink-0"
                title="이 작업이 출처인 변경이력 보기"
                aria-label={`출처 변경이력 ${sourceCount}건 보기`}
              >
                <Badge variant="info" size="sm" className="cursor-pointer hover:bg-accent-soft hover:text-accent transition-colors">
                  <FileText size={10} className="mr-0.5" /> {sourceCount}
                </Badge>
              </button>
            )}
          </div>
        </td>
        <td className="py-2 px-3 text-sm text-secondary">{item.assignee}</td>
        <td className="py-2 px-3 text-xs text-muted">{item.startDate?.slice(0, 10)}</td>
        <td className="py-2 px-3 text-xs text-muted">{item.endDate?.slice(0, 10)}</td>
        <td className="py-2 px-3">
          <Badge variant={importance.variant} size="sm">{importance.label}</Badge>
        </td>
        <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
          <BadgeMenu<WbsStatus>
            value={item.status}
            options={[
              { value: 'Planned',    label: '예정', variant: 'neutral' },
              { value: 'InProgress', label: '진행', variant: 'warning' },
              { value: 'Done',       label: '완료', variant: 'success' },
            ]}
            onChange={(next) => onStatusChange(item, next)}
            title="상태 변경"
          />
        </td>
        <td className="py-2 px-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onAddChild(item.id)}
              title="하위 작업 추가"
              aria-label={`${item.name} 의 하위 작업 추가`}
              className="p-1 text-muted hover:text-primary transition-colors"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={() => onEdit(item)}
              title="수정"
              aria-label={`${item.name} 수정`}
              className="p-1 text-muted hover:text-primary transition-colors"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              title="삭제"
              aria-label={`${item.name} 삭제`}
              className="p-1 text-on-danger hover:opacity-80 transition-opacity"
            >
              <X size={14} />
            </button>
          </div>
        </td>
      </tr>
      {expanded && item.children?.map((child) => (
        <WbsRow key={child.id} item={child} projectId={projectId} depth={depth + 1}
          matchedIds={matchedIds}
          linkCountByWbs={linkCountByWbs}
          sourceCountByWbs={sourceCountByWbs}
          onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild} onStatusChange={onStatusChange} />
      ))}
    </>
  );
}

export function WbsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = parseInt(projectId!);
  const [items, setItems] = useState<WbsItem[]>([]);
  const [versions, setVersions] = useState<WbsVersion[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [allIssues, setAllIssues] = useState<Issue[]>([]);
  const [linkCountByWbs, setLinkCountByWbs] = useState<Map<number, number>>(new Map());
  const [sourceCountByWbs, setSourceCountByWbs] = useState<Record<number, number>>({});
  const [currentVersion, setCurrentVersion] = useState<number | undefined>();
  const [view, setView] = useState<'table' | 'gantt'>('table');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WbsItem | null>(null);
  const [dateEditing, setDateEditing] = useState<WbsItem | null>(null);
  const [addingChildOf, setAddingChildOf] = useState<number | undefined>();
  const [showVersionForm, setShowVersionForm] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');
  const [keyword, setKeyword] = useState('');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [lateOnly, setLateOnly] = useState(false);
  const [matchOnly, setMatchOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const filterOpts: WbsFilterOpts = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return { kw: keyword.trim().toLowerCase(), unassigned: unassignedOnly, late: lateOnly, todayMs: t.getTime() };
  }, [keyword, unassignedOnly, lateOnly]);

  const matchedIds = useMemo(
    () => hasAnyFilter(filterOpts) ? collectMatchedIds(items, filterOpts) : new Set<number>(),
    [items, filterOpts],
  );

  const visibleItems = useMemo(
    () => (matchOnly && hasAnyFilter(filterOpts)) ? filterWbsTree(items, filterOpts) : items,
    [items, filterOpts, matchOnly],
  );

  // link tuple → wbsItemId 별 카운트 Map. 0 인 항목은 키 미포함.
  const computeLinkCountsByWbs = (links: { wbsItemId: number }[]) => {
    const m = new Map<number, number>();
    for (const { wbsItemId } of links) m.set(wbsItemId, (m.get(wbsItemId) ?? 0) + 1);
    return m;
  };

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [is, vs, rs, ais, lks, srcCounts] = await Promise.all([
        wbsApi.getByProject(pid, currentVersion),
        wbsApi.getVersions(pid),
        resourcesApi.getAll(),
        issuesApi.getByProject(pid),
        issueWbsLinksApi.byProject(pid).catch(() => []),
        changeLogsApi.getSourceCounts(pid).catch(() => ({ byIssueId: {}, byWbsItemId: {} })),
      ]);
      setItems(is);
      setVersions(vs);
      setResources(rs);
      setAllIssues(ais);
      setLinkCountByWbs(computeLinkCountsByWbs(lks));
      setSourceCountByWbs(srcCounts.byWbsItemId);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [pid, currentVersion]);

  // CRUD 후 items/versions + link 카운트 갱신 (로딩 깜빡임 없이).
  const refresh = useCallback(() => {
    wbsApi.getByProject(pid, currentVersion).then(setItems).catch(() => {});
    wbsApi.getVersions(pid).then(setVersions).catch(() => {});
    issueWbsLinksApi.byProject(pid).then((lks) => setLinkCountByWbs(computeLinkCountsByWbs(lks))).catch(() => {});
    changeLogsApi.getSourceCounts(pid).then((c) => setSourceCountByWbs(c.byWbsItemId)).catch(() => {});
  }, [pid, currentVersion]);

  // RelatedIssuesSection 에서 link create/delete 후 카운트만 갱신 (모달 안에서 호출).
  const refreshLinkCounts = useCallback(() => {
    issueWbsLinksApi.byProject(pid).then((lks) => setLinkCountByWbs(computeLinkCountsByWbs(lks))).catch(() => {});
  }, [pid]);

  // picker 열 때마다 issues silent refetch — 다른 탭에서 만든 새 Issue 즉시 반영.
  const refreshIssues = useCallback(() => {
    issuesApi.getByProject(pid).then(setAllIssues).catch(() => {});
  }, [pid]);

  useEffect(() => { load(); }, [load]);

  useHighlightFromQuery([items.length]);

  const handleDelete = async (id: number) => {
    if (!await confirmDialog({
      title: 'WBS 항목 삭제',
      message: '이 WBS 항목을 삭제하시겠습니까? 하위 항목도 함께 삭제되며 되돌릴 수 없습니다.',
      confirmLabel: '삭제',
      danger: true,
    })) return;
    await wbsApi.delete(pid, id);
    refresh();
  };

  const handleStatusChange = async (item: WbsItem, status: WbsStatus) => {
    if (item.status === status) return;
    setItems((prev) => patchStatus(prev, item.id, status));
    const { children: _children, ...rest } = item;
    await wbsApi.update(pid, item.id, { ...rest, status });
    refresh();
  };

  const handleCreateVersion = async () => {
    if (!newVersionName.trim()) return;
    const v = await wbsApi.createVersion({ projectId: pid, versionName: newVersionName, description: '' });
    setVersions((prev) => [...prev, v]);
    setNewVersionName('');
    setShowVersionForm(false);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h-page flex items-center gap-2">
          <CalendarDays size={18} className="text-muted" />
          일정 / WBS
        </h1>
        <div className="flex gap-2">
          <div className="flex bg-surface border border-default rounded-md p-1 gap-1">
            <Button
              variant={view === 'table' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setView('table')}
            >
              표
            </Button>
            <Button
              variant={view === 'gantt' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setView('gantt')}
            >
              간트
            </Button>
          </div>
          <Button variant="primary" onClick={() => setShowForm(true)} leadingIcon={<Plus size={16} />}>
            작업 추가
          </Button>
        </div>
      </div>

      <Card padding="tight" className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted">버전:</span>
        <select
          value={currentVersion ?? ''}
          onChange={(e) => setCurrentVersion(e.target.value ? parseInt(e.target.value) : undefined)}
          className="px-3 py-1.5 text-sm rounded-md"
        >
          <option value="">전체</option>
          {versions.map((v) => <option key={v.id} value={v.id}>{v.versionName}{v.isCurrent ? ' (현재)' : ''}</option>)}
        </select>
        <Button variant="ghost" size="sm" onClick={() => setShowVersionForm(!showVersionForm)}>
          + 버전
        </Button>
        {showVersionForm && (
          <div className="flex gap-2 items-center">
            <input
              value={newVersionName}
              onChange={(e) => setNewVersionName(e.target.value)}
              placeholder="v1.0"
              className="px-2 py-1 text-sm rounded-md w-24"
            />
            <Button variant="primary" size="sm" onClick={handleCreateVersion}>확인</Button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="작업명·담당자·노트…"
              className={`${inputClass} pl-7 py-1.5 text-sm w-48`}
            />
          </div>
          <Button variant={unassignedOnly ? 'primary' : 'secondary'} size="sm" onClick={() => setUnassignedOnly((v) => !v)}>
            미할당
          </Button>
          <Button variant={lateOnly ? 'primary' : 'secondary'} size="sm" onClick={() => setLateOnly((v) => !v)}>
            지연
          </Button>
          {hasAnyFilter(filterOpts) && (
            <>
              <label className="text-xs text-muted flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={matchOnly} onChange={(e) => setMatchOnly(e.target.checked)} />
                매칭만 보기
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setKeyword(''); setUnassignedOnly(false); setLateOnly(false); setMatchOnly(false); }}
              >
                초기화
              </Button>
            </>
          )}
        </div>
      </Card>

      {loading ? (
        <Card padding="spacious">
          <Skeleton height={18} width="30%" />
          <div className="mt-4 space-y-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ paddingLeft: (i % 3) * 20 }}>
                <Skeleton height={24} />
              </div>
            ))}
          </div>
        </Card>
      ) : error ? (
        <Card padding="spacious">
          <EmptyState error={error} onRetry={load} />
        </Card>
      ) : view === 'gantt' ? (
        <Card padding="normal">
          <GanttChart
            items={items}
            projectId={pid}
            onDoubleClick={(it) => setDateEditing(it)}
            onItemsChanged={refresh}
          />
        </Card>
      ) : items.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<CalendarDays size={40} />}
            title="작업이 없습니다."
            description="우측 상단 '작업 추가' 버튼으로 첫 작업을 만들어보세요."
          />
        </Card>
      ) : (
        <Card padding="none" className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-default text-xs text-muted">
                <th className="text-left py-3 px-4 font-medium">작업명</th>
                <th className="text-left py-3 px-3 font-medium">담당자</th>
                <th className="text-left py-3 px-3 font-medium">시작일</th>
                <th className="text-left py-3 px-3 font-medium">종료일</th>
                <th className="text-left py-3 px-3 font-medium">중요도</th>
                <th className="text-left py-3 px-3 font-medium">상태</th>
                <th className="text-left py-3 px-3 font-medium">작업</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={<Search size={32} />}
                      title="조건에 맞는 작업이 없습니다."
                      description="필터를 초기화해 보세요."
                    />
                  </td>
                </tr>
              ) : visibleItems.map((item) => (
                <WbsRow
                  key={item.id}
                  item={item}
                  projectId={pid}
                  matchedIds={matchedIds}
                  linkCountByWbs={linkCountByWbs}
                  sourceCountByWbs={sourceCountByWbs}
                  onEdit={setEditing}
                  onDelete={handleDelete}
                  onAddChild={(parentId) => { setAddingChildOf(parentId); setShowForm(true); }}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {showForm && (
        <WbsItemForm
          projectId={pid}
          versionId={currentVersion}
          parentId={addingChildOf}
          resources={resources}
          allItems={items}
          allIssues={allIssues}
          onRefreshIssues={refreshIssues}
          onLinksChanged={refreshLinkCounts}
          onSave={() => { setShowForm(false); setAddingChildOf(undefined); refresh(); }}
          onCancel={() => { setShowForm(false); setAddingChildOf(undefined); }}
        />
      )}
      {editing && (
        <WbsItemForm
          projectId={pid}
          initial={editing}
          resources={resources}
          allItems={items}
          allIssues={allIssues}
          onRefreshIssues={refreshIssues}
          onLinksChanged={refreshLinkCounts}
          onSave={() => { setEditing(null); refresh(); }}
          onCancel={() => setEditing(null)}
        />
      )}
      {dateEditing && (
        <DateEditModal
          item={dateEditing}
          projectId={pid}
          onSave={() => { setDateEditing(null); refresh(); }}
          onCancel={() => setDateEditing(null)}
        />
      )}
    </div>
  );
}
