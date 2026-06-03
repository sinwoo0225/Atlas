import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrentProject } from '../hooks/useCurrentProject';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { Plus, X, Save, ChevronDown, ChevronRight, CalendarDays, Search, ListChecks, Filter, LayoutTemplate } from 'lucide-react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor,
  closestCenter, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { wbsApi } from '../api/wbs';
import { wbsTemplatesApi } from '../api/wbsTemplates';
import { WbsTemplatePicker, type TemplateApplySelection } from '../components/WbsTemplatePicker';
import { resourcesApi } from '../api/resources';
import { changeLogsApi } from '../api/changelogs';
import { Button, Card, Modal, BadgeMenu, EmptyState, Skeleton, DirtyDot, FormField, inputClass } from '../components/ui';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { AssigneeTagInput } from '../components/AssigneeTagInput';
import { applyTextareaTab } from '../utils/textareaTab';
import {
  collectDescendantIds, collectMatchedIds, filterWbsTree, findItem, findItemName,
  applySortOrderPatchesLocal, hasAnyFilter, uniqueAssigneesSplit, type WbsFilterOpts,
} from '../utils/wbsHelpers';
import { wbsStatusBadge } from '../utils/statusMaps';
import { sortWbsTree } from '../utils/wbsSort';
import { WbsTreePicker } from '../components/WbsTreePicker';
import { IssuePicker } from '../components/IssuePicker';
import { issuesApi } from '../api/issues';
import { issueWbsLinksApi, type IssueWbsLink } from '../api/issueWbsLinks';
import { GanttChart } from './wbs/GanttChart';
import { SortableWbsRow } from './wbs/SortableWbsRow';
import { WbsDragOverlayRow } from './wbs/WbsDragOverlayRow';
import { computeSiblingReorder } from './wbs/wbsReorder';
import { useHighlightFromQuery } from '../hooks/useHighlightFromQuery';
import { useCreateForm } from '../hooks/useCreateForm';
import type { WbsItem, WbsVersion, Resource, WbsStatus, Issue, IssueWbsLinkType } from '../types';
import { linkTypeOptions } from '../utils/issueWbsLinkType';

function patchStatus(items: WbsItem[], id: number, status: WbsStatus): WbsItem[] {
  return items.map((it) => {
    if (it.id === id) return { ...it, status };
    if (it.children?.length) return { ...it, children: patchStatus(it.children, id, status) };
    return it;
  });
}

type WbsFormData = {
  name: string; assignee: string; startDate: string; endDate: string;
  status: string; isMilestone: boolean; importance: string; notes: string;
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
  const { t } = useTranslation();
  const initialForm: WbsFormData = {
    name: initial?.name ?? '',
    assignee: initial?.assignee ?? '',
    startDate: initial?.startDate?.slice(0, 10) ?? '',
    endDate: initial?.endDate?.slice(0, 10) ?? '',
    status: initial?.status ?? 'Planned',
    isMilestone: initial?.isMilestone ?? false,
    importance: (initial?.importance ?? 2).toString(),
    notes: initial?.notes ?? '',
    parentId: initial?.parentId ?? parentId ?? null,
  };
  const [form, setForm] = useState<WbsFormData>(initialForm);
  const [initialSnapshot, setInitialSnapshot] = useState(() => JSON.stringify(initialForm));
  const dirty = JSON.stringify(form) !== initialSnapshot;
  // 동시성 토큰 (사이클 12) — 충돌 시 [서버 값 보기] 액션으로 갱신.
  const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState<string | undefined>(initial?.updatedAt);
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
      status: form.status as WbsStatus, isMilestone: form.isMilestone,
      importance: parseInt(form.importance) || 2, notes: form.notes,
      ...(initial ? { updatedAt: snapshotUpdatedAt, sortOrder: initial.sortOrder } : {}),
    };
    if (initial) {
      const parentChanged = (initial.parentId ?? null) !== form.parentId;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload 객체 리터럴↔UpdateWbsItemDto 구조 일치, 캐스트만 필요
        await wbsApi.update(projectId, initial.id, payload as any, { silent: true });
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('API error 409')) {
          toast.warning(
            t('wbs:form.conflict'),
            {
              duration: 8000,
              action: {
                label: t('wbs:form.viewServer'),
                onClick: async () => {
                  const fresh = await wbsApi.get(projectId, initial.id);
                  setSnapshotUpdatedAt(fresh.updatedAt);
                  const freshForm: WbsFormData = {
                    name: fresh.name,
                    assignee: fresh.assignee,
                    startDate: fresh.startDate?.slice(0, 10) ?? '',
                    endDate: fresh.endDate?.slice(0, 10) ?? '',
                    status: fresh.status,
                    isMilestone: fresh.isMilestone,
                    importance: (fresh.importance ?? 2).toString(),
                    notes: fresh.notes ?? '',
                    parentId: fresh.parentId ?? null,
                  };
                  setForm(freshForm);
                  setInitialSnapshot(JSON.stringify(freshForm));
                  toast.info(t('wbs:form.fetchedServer'));
                },
              },
            },
          );
          return;
        }
        toast.error(t('common:saveFailed'));
        return;
      }
      if (parentChanged) {
        const target = findItemName(form.parentId, allItems);
        toast.success(
          descendantCount > 0
            ? t('wbs:form.movedWithChildren', { name: initial.name, target, count: descendantCount })
            : t('wbs:form.moved', { name: initial.name, target }),
        );
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload 객체 리터럴↔CreateWbsItemDto 구조 일치, 캐스트만 필요
      await wbsApi.create(payload as any);
      toast.success(t('wbs:form.created', { name: form.name }));
    }
    onSave();
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title={initial ? t('wbs:form.editTitle') : t('wbs:form.addTitle')}
      size="xl"
      fixedHeight
      dirty={dirty}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>{t('common:cancel')}</Button>
          <Button variant="primary" onClick={handleSubmit} leadingIcon={<Save size={16} />}>{t('common:save')}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
          {/* 좌측 - 기본 필드. picker 펼침 시 picker 영역이 남은 공간 다 차지 (flex-1). */}
          <div className="flex flex-col gap-3 min-h-0">
            <FormField label={t('wbs:form.name')} required>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
            </FormField>
            <FormField label={t('wbs:form.assignee')}>
              <AssigneeTagInput
                value={form.assignee}
                onChange={(v) => set('assignee', v)}
                resources={resources}
                placeholder={t('wbs:form.assigneePlaceholder')}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t('wbs:form.startDate')}>
                <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputClass} />
              </FormField>
              <FormField label={t('wbs:form.endDate')}>
                <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className={inputClass} />
              </FormField>
            </div>
            <FormField label={t('wbs:form.importance')}>
              <select value={form.importance} onChange={(e) => set('importance', e.target.value)} className={inputClass}>
                <option value="3">{t('status:importance.High')}</option>
                <option value="2">{t('status:importance.Medium')}</option>
                <option value="1">{t('status:importance.Low')}</option>
              </select>
            </FormField>
            <FormField label={t('wbs:form.status')}>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputClass}>
                <option value="Planned">{t('status:wbs.Planned')}</option>
                <option value="InProgress">{t('status:wbs.InProgress')}</option>
                <option value="Done">{t('status:wbs.Done')}</option>
              </select>
            </FormField>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isMilestone} onChange={(e) => set('isMilestone', e.target.checked)} className="rounded" />
              <span className="text-sm text-secondary">{t('wbs:form.milestone')}</span>
            </label>
            {initial && (
              <FormField label={t('wbs:form.parent')} className={pickerOpen ? 'flex-1 min-h-0' : 'shrink-0'}>
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
                        {t('wbs:form.descendantHint', { count: descendantCount })}
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
            <FormField label={t('wbs:form.notes')} className="min-h-0 flex-1">
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
                    placeholder={t('wbs:form.notesPlaceholder')}
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const linkOptions = useMemo(() => linkTypeOptions(t), [t]);
  const [links, setLinks] = useState<IssueWbsLink[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerType, setPickerType] = useState<IssueWbsLinkType>('RelatesTo');

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
      await issueWbsLinksApi.create(issueId, wbsItemId, pickerType);
      setPickerOpen(false);
      load();
      onLinksChanged();
    } catch { /* api/client.ts 가 토스트 처리 */ }
  };

  const handleChangeType = async (link: IssueWbsLink, next: IssueWbsLinkType) => {
    if (link.type === next) return;
    try {
      await issueWbsLinksApi.updateType(link.id, next);
      load();
    } catch { /* api/client.ts */ }
  };

  const handleRemove = async (issueId: number, title: string) => {
    if (!await confirmDialog({
      title: t('wbs:related.unlinkTitle'),
      message: t('wbs:related.unlinkMessage', { title }),
      confirmLabel: t('wbs:related.unlink'),
    })) return;
    await issueWbsLinksApi.delete(issueId, wbsItemId);
    load();
    onLinksChanged();
  };

  return (
    <div className={pickerOpen ? 'flex flex-col min-h-0 gap-1 flex-1' : 'shrink-0 flex flex-col gap-1'}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted font-medium flex items-center gap-1">
          <ListChecks size={12} /> {t('wbs:related.title', { count: links.length })}
        </p>
        <Button variant="ghost" size="sm" onClick={togglePicker} leadingIcon={<Plus size={12} />}>
          {pickerOpen ? t('common:close') : t('wbs:related.addLink')}
        </Button>
      </div>
      {links.length === 0 && !pickerOpen ? (
        <p className="text-xs text-muted italic">{t('wbs:related.noLinks')}</p>
      ) : (
        <ul className="space-y-1">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 bg-surface-2 border border-default rounded px-2 py-1 text-sm">
              <BadgeMenu<IssueWbsLinkType>
                value={l.type}
                options={linkOptions}
                onChange={(next) => handleChangeType(l, next)}
                title={t('wbs:related.changeType')}
              />
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
                title={t('wbs:related.unlink')}
                aria-label={t('wbs:related.unlinkAria', { title: l.issueTitle ?? `#${l.issueId}` })}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {pickerOpen && (
        <>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted">
            <span>{t('wbs:related.relationType')}</span>
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
          <div className="mt-1 flex-1 min-h-0">
            <IssuePicker
              items={allIssues}
              excludeIds={excludeIds}
              onSelect={handleAdd}
            />
          </div>
        </>
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
  const { t } = useTranslation();
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
      title={t('wbs:dateEdit.title', { name: item.name })}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>{t('common:cancel')}</Button>
          <Button variant="primary" onClick={handleSave} leadingIcon={<Save size={16} />}>{t('common:save')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label={t('wbs:form.startDate')}>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t('wbs:form.endDate')}>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
        </FormField>
      </div>
    </Modal>
  );
}


export function WbsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = parseInt(projectId!);
  const project = useCurrentProject();
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
  const [filterStatuses, setFilterStatuses] = useState<Set<WbsStatus>>(new Set());
  const [filterAssignees, setFilterAssignees] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [matchOnly, setMatchOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // 일정 템플릿 — 적용 피커 + '현재 WBS를 템플릿으로 저장' 모달.
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [saveTemplateForm, setSaveTemplateForm] = useState<{ name: string; description: string; category: string } | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  useCreateForm(() => { setEditing(null); setAddingChildOf(undefined); setShowForm(true); });

  const filterOpts: WbsFilterOpts = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return {
      kw: keyword.trim().toLowerCase(),
      unassigned: unassignedOnly,
      late: lateOnly,
      statuses: filterStatuses,
      assignees: filterAssignees,
      todayMs: t.getTime(),
    };
  }, [keyword, unassignedOnly, lateOnly, filterStatuses, filterAssignees]);

  const assigneeOptions = useMemo(() => uniqueAssigneesSplit(items), [items]);

  // 패널 칩 필터 활성 개수 (상태·담당자·미할당·지연). 키워드는 별도(바).
  const chipFilterCount = filterStatuses.size + filterAssignees.size + (unassignedOnly ? 1 : 0) + (lateOnly ? 1 : 0);

  const toggleStatus = (s: WbsStatus) => setFilterStatuses((prev) => {
    const next = new Set(prev);
    if (next.has(s)) next.delete(s); else next.add(s);
    return next;
  });
  const toggleAssignee = (a: string) => setFilterAssignees((prev) => {
    const next = new Set(prev);
    if (next.has(a)) next.delete(a); else next.add(a);
    return next;
  });
  const resetFilters = () => {
    setKeyword('');
    setUnassignedOnly(false);
    setLateOnly(false);
    setFilterStatuses(new Set());
    setFilterAssignees(new Set());
    setMatchOnly(false);
  };

  const matchedIds = useMemo(
    () => hasAnyFilter(filterOpts) ? collectMatchedIds(items, filterOpts) : new Set<number>(),
    [items, filterOpts],
  );

  const visibleItems = useMemo(() => {
    const base = (matchOnly && hasAnyFilter(filterOpts)) ? filterWbsTree(items, filterOpts) : items;
    return sortWbsTree(base);
  }, [items, filterOpts, matchOnly]);

  // 사이클 13 — dnd-kit 형제 reorder (P8-4). matchOnly 시 화면 형제 ⊂ 원본이라 reorder 비활성.
  const reorderDisabled = matchOnly && hasAnyFilter(filterOpts);
  const [activeId, setActiveId] = useState<number | null>(null);
  const activeItem = useMemo(
    () => (activeId != null ? findItem(activeId, items) : null),
    [activeId, items],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
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
      title: t('wbs:page.deleteTitle'),
      message: t('wbs:page.deleteMessage'),
      confirmLabel: t('common:delete'),
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

  // 사이클 13 — 형제 reorder drop 처리. 같은 부모 안에서만 작동, 다른 부모로 드롭 시 무시.
  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const activeData = active.data.current as { parentId: number | null } | undefined;
    const overData = over.data.current as { parentId: number | null } | undefined;
    if (!activeData || !overData) return;
    if (activeData.parentId !== overData.parentId) {
      toast.info(t('wbs:page.dragParentUnsupported'));
      return;
    }

    const siblings = activeData.parentId == null
      ? items
      : (findItem(activeData.parentId, items)?.children ?? []);
    const patches = computeSiblingReorder(siblings, Number(active.id), Number(over.id));
    if (patches.length === 0) return;

    // optimistic — 로컬 트리에 newSortOrder 즉시 반영 (sortWbsTree 가 화면 재정렬).
    setItems((prev) => applySortOrderPatchesLocal(prev, activeData.parentId, patches));

    const results = await Promise.allSettled(
      patches.map((p) => {
        const target = findItem(p.id, items);
        if (!target) return Promise.reject(new Error('not_found'));
        const { children: _c, ...rest } = target;
        return wbsApi.update(
          pid, p.id,
          { ...rest, sortOrder: p.newSortOrder, updatedAt: p.updatedAt },
          { silent: true },
        );
      }),
    );
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length === 0) {
      toast.success(t('wbs:page.reordered', { count: patches.length }));
    } else if (failed.length === patches.length) {
      toast.error(t('wbs:page.reorderFailed'), { duration: 6000 });
      refresh();
    } else {
      toast.error(t('wbs:page.reorderPartialFailed', { count: failed.length }), { duration: 6000 });
      refresh();
    }
  };

  const handleCreateVersion = async () => {
    if (!newVersionName.trim()) return;
    const v = await wbsApi.createVersion({ projectId: pid, versionName: newVersionName, description: '' });
    setVersions((prev) => [...prev, v]);
    setNewVersionName('');
    setShowVersionForm(false);
  };

  const handleApplyTemplate = async (sel: TemplateApplySelection) => {
    setApplyingTemplate(true);
    try {
      const r = await wbsTemplatesApi.apply(pid, { ...sel, versionId: currentVersion ?? null });
      toast.success(t('wbs:page.templateApplied', { count: r.createdCount }));
      setShowTemplatePicker(false);
      refresh();
    } catch { /* client.ts 토스트 처리 */ }
    finally { setApplyingTemplate(false); }
  };

  const handleSaveTemplate = async () => {
    if (!saveTemplateForm) return;
    if (!saveTemplateForm.name.trim()) { toast.error(t('wbs:page.templateNameRequired')); return; }
    setSavingTemplate(true);
    try {
      await wbsTemplatesApi.fromProject({
        projectId: pid,
        name: saveTemplateForm.name.trim(),
        description: saveTemplateForm.description,
        category: saveTemplateForm.category,
        versionId: currentVersion ?? null,
      });
      toast.success(t('wbs:page.templateSaved'));
      setSaveTemplateForm(null);
    } catch { /* client.ts 토스트 처리 */ }
    finally { setSavingTemplate(false); }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h-page flex items-center gap-2 min-w-0">
          <CalendarDays size={18} className="text-muted shrink-0" />
          {project && (
            <>
              <span className="text-muted font-normal truncate">{project.name}</span>
              <ChevronRight size={14} className="text-muted shrink-0" />
            </>
          )}
          <span className="shrink-0">{t('wbs:page.title')}</span>
        </h1>
        <div className="flex gap-2">
          <div className="flex bg-surface border border-default rounded-md p-1 gap-1">
            <Button
              variant={view === 'table' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setView('table')}
            >
              {t('wbs:page.viewTable')}
            </Button>
            <Button
              variant={view === 'gantt' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setView('gantt')}
            >
              {t('wbs:page.viewGantt')}
            </Button>
          </div>
          {items.length > 0 && (
            <>
              <Button
                variant="secondary"
                onClick={() => setShowTemplatePicker(true)}
                leadingIcon={<LayoutTemplate size={16} />}
              >
                {t('wbs:page.applyTemplate')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setSaveTemplateForm({ name: '', description: '', category: '' })}
                leadingIcon={<Save size={16} />}
              >
                {t('wbs:page.saveTemplate')}
              </Button>
            </>
          )}
          <Button variant="primary" onClick={() => setShowForm(true)} leadingIcon={<Plus size={16} />}>
            {t('wbs:page.addTask')}
          </Button>
        </div>
      </div>

      <Card padding="tight" className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted">{t('wbs:page.version')}</span>
        <select
          value={currentVersion ?? ''}
          onChange={(e) => setCurrentVersion(e.target.value ? parseInt(e.target.value) : undefined)}
          className="px-3 py-1.5 text-sm rounded-md"
        >
          <option value="">{t('wbs:page.allVersions')}</option>
          {versions.map((v) => <option key={v.id} value={v.id}>{v.versionName}{v.isCurrent ? t('wbs:page.currentSuffix') : ''}</option>)}
        </select>
        <Button variant="ghost" size="sm" onClick={() => setShowVersionForm(!showVersionForm)}>
          {t('wbs:page.addVersion')}
        </Button>
        {showVersionForm && (
          <div className="flex gap-2 items-center">
            <input
              value={newVersionName}
              onChange={(e) => setNewVersionName(e.target.value)}
              placeholder="v1.0"
              className="px-2 py-1 text-sm rounded-md w-24"
            />
            <Button variant="primary" size="sm" onClick={handleCreateVersion}>{t('common:confirm')}</Button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* 키워드·매칭만 = 표 전용. 상태·담당자·미할당·지연 = 패널 안 공통 필터. */}
          {view === 'table' && (
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                type="search"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t('wbs:page.searchPlaceholder')}
                className={`${inputClass} pl-7 py-1.5 text-sm w-48`}
              />
            </div>
          )}
          <Button
            variant={(showFilters || chipFilterCount > 0) ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
            leadingIcon={<Filter size={14} />}
          >
            {t('wbs:page.filter')}
            {chipFilterCount > 0 && ` (${chipFilterCount})`}
          </Button>
          {/* 패널이 닫혀 있을 때만 바에 노출 — 열려 있으면 칩 옆(패널)에서 토글. */}
          {view === 'table' && hasAnyFilter(filterOpts) && !showFilters && (
            <label className="text-xs text-muted flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={matchOnly} onChange={(e) => setMatchOnly(e.target.checked)} />
              {t('wbs:page.matchOnly')}
            </label>
          )}
          {hasAnyFilter(filterOpts) && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              {t('common:reset')}
            </Button>
          )}
        </div>
      </Card>

      {showFilters && (
        <Card padding="tight" className="space-y-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted w-12 shrink-0">{t('wbs:page.filterStatus')}</span>
            {(['Planned', 'InProgress', 'Done'] as WbsStatus[]).map((s) => {
              const active = filterStatuses.has(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className={`px-2 py-0.5 rounded border transition-colors ${
                    active ? 'bg-accent-soft border-accent text-accent' : 'border-default text-secondary hover:border-strong'
                  }`}
                >
                  {t(wbsStatusBadge[s].labelKey)}
                </button>
              );
            })}
            <button
              onClick={() => setLateOnly((v) => !v)}
              className={`px-2 py-0.5 rounded border transition-colors ${
                lateOnly ? 'bg-accent-soft border-accent text-accent' : 'border-default text-secondary hover:border-strong'
              }`}
              title={t('wbs:page.lateTitle')}
            >
              {t('wbs:page.late')}
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted w-12 shrink-0">{t('wbs:page.filterAssignee')}</span>
            <button
              onClick={() => setUnassignedOnly((v) => !v)}
              className={`px-2 py-0.5 rounded border transition-colors ${
                unassignedOnly ? 'bg-accent-soft border-accent text-accent' : 'border-default text-secondary hover:border-strong'
              }`}
            >
              {t('wbs:page.unassigned')}
            </button>
            {assigneeOptions.map((a) => {
                const active = filterAssignees.has(a);
                return (
                  <button
                    key={a}
                    onClick={() => toggleAssignee(a)}
                    className={`px-2 py-0.5 rounded border transition-colors ${
                      active ? 'bg-accent-soft border-accent text-accent' : 'border-default text-secondary hover:border-strong'
                    }`}
                  >
                    {a}
                  </button>
                );
              })}
          </div>
          {view === 'table' && hasAnyFilter(filterOpts) && (
            <div className="flex items-center gap-2 pt-1 border-t border-default">
              <span className="text-muted w-12 shrink-0">{t('wbs:page.filterView')}</span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={matchOnly} onChange={(e) => setMatchOnly(e.target.checked)} />
                {t('wbs:page.matchOnlyFull')}
              </label>
            </div>
          )}
        </Card>
      )}

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
            filterStatuses={filterStatuses}
            filterAssignees={filterAssignees}
            unassignedOnly={unassignedOnly}
            lateOnly={lateOnly}
          />
        </Card>
      ) : items.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<CalendarDays size={40} />}
            title={t('wbs:page.empty')}
            description={t('wbs:page.emptyDesc')}
            action={
              <Button variant="primary" size="sm" onClick={() => setShowTemplatePicker(true)} leadingIcon={<LayoutTemplate size={14} />}>
                {t('wbs:page.startFromTemplate')}
              </Button>
            }
          />
        </Card>
      ) : (
        <Card padding="none" className="overflow-x-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(e) => setActiveId(Number(e.active.id))}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <table className="w-full min-w-[960px]">
              <thead>
                <tr className="border-b border-default text-xs text-muted">
                  <th className="text-left py-3 px-4 font-medium">{t('wbs:page.colName')}</th>
                  <th className="text-left py-3 px-3 font-medium whitespace-nowrap w-28">{t('wbs:page.colAssignee')}</th>
                  <th className="text-left py-3 px-3 font-medium whitespace-nowrap w-24">{t('wbs:page.colStart')}</th>
                  <th className="text-left py-3 px-3 font-medium whitespace-nowrap w-24">{t('wbs:page.colEnd')}</th>
                  <th className="text-left py-3 px-3 font-medium whitespace-nowrap w-20">{t('wbs:page.colImportance')}</th>
                  <th className="text-left py-3 px-3 font-medium whitespace-nowrap w-20">{t('wbs:page.colStatus')}</th>
                  <th className="text-left py-3 px-3 font-medium whitespace-nowrap w-24">{t('wbs:page.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        icon={<Search size={32} />}
                        title={t('wbs:page.noMatch')}
                        description={t('wbs:page.noMatchDesc')}
                      />
                    </td>
                  </tr>
                ) : (
                  <SortableContext
                    items={visibleItems.map((i) => i.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {visibleItems.map((item) => (
                      <SortableWbsRow
                        key={item.id}
                        item={item}
                        projectId={pid}
                        matchedIds={matchedIds}
                        linkCountByWbs={linkCountByWbs}
                        sourceCountByWbs={sourceCountByWbs}
                        reorderDisabled={reorderDisabled}
                        onEdit={setEditing}
                        onDelete={handleDelete}
                        onAddChild={(parentId) => { setAddingChildOf(parentId); setShowForm(true); }}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                  </SortableContext>
                )}
              </tbody>
            </table>
            <DragOverlay>{activeItem && <WbsDragOverlayRow item={activeItem} />}</DragOverlay>
          </DndContext>
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

      <WbsTemplatePicker
        open={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        onApply={handleApplyTemplate}
        busy={applyingTemplate}
        hasExisting={items.length > 0}
      />

      {saveTemplateForm && (
        <Modal
          open
          onClose={() => setSaveTemplateForm(null)}
          title={t('wbs:saveTemplateModal.title')}
          size="md"
          showCloseButton
          footer={
            <>
              <Button variant="secondary" onClick={() => setSaveTemplateForm(null)} leadingIcon={<X size={16} />}>
                {t('common:cancel')}
              </Button>
              <Button variant="primary" onClick={handleSaveTemplate} leadingIcon={<Save size={16} />} disabled={savingTemplate}>
                {savingTemplate ? t('wbs:saveTemplateModal.saving') : t('common:save')}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-muted">
              {t('wbs:saveTemplateModal.desc')}
            </p>
            <FormField label={t('wbs:saveTemplateModal.name')} required>
              <input
                value={saveTemplateForm.name}
                onChange={(e) => setSaveTemplateForm((f) => f && { ...f, name: e.target.value })}
                className={inputClass}
                autoFocus
              />
            </FormField>
            <FormField label={t('wbs:saveTemplateModal.category')}>
              <input
                value={saveTemplateForm.category}
                onChange={(e) => setSaveTemplateForm((f) => f && { ...f, category: e.target.value })}
                className={inputClass}
                placeholder={t('wbs:saveTemplateModal.categoryPlaceholder')}
              />
            </FormField>
            <FormField label={t('wbs:saveTemplateModal.description')}>
              <input
                value={saveTemplateForm.description}
                onChange={(e) => setSaveTemplateForm((f) => f && { ...f, description: e.target.value })}
                className={inputClass}
              />
            </FormField>
          </div>
        </Modal>
      )}
    </div>
  );
}
