import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrentProject } from '../hooks/useCurrentProject';
import { Markdown } from '../components/ui/Markdown';
import { toast } from 'sonner';
import { Plus, X, Save, ChevronDown, ChevronRight, CalendarDays, Search, ListChecks, Filter, LayoutTemplate, Code2, GitBranch, Bookmark, Flag, FolderTree } from 'lucide-react';
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
import { Button, Card, Modal, Badge, BadgeMenu, EmptyState, Skeleton, DirtyDot, FormField, inputClass, inputClassSm } from '../components/ui';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { AssigneeTagInput } from '../components/AssigneeTagInput';
import { applyTextareaTab } from '../utils/textareaTab';
import {
  collectAncestorIds, collectCollapsibleIds, collectDescendantIds, collectMatchedIds, filterWbsTree, findItem, findItemName, flattenWbsTree,
  applySortOrderPatchesLocal, hasAnyFilter, uniqueAssigneesSplit, type WbsFilterOpts,
} from '../utils/wbsHelpers';
import { wbsStatusBadge, devInfoTypeBadge } from '../utils/statusMaps';
import { sortWbsTree } from '../utils/wbsSort';
import { WbsTreePicker } from '../components/WbsTreePicker';
import { IssuePicker } from '../components/IssuePicker';
import { issuesApi } from '../api/issues';
import { issueWbsLinksApi, type IssueWbsLink } from '../api/issueWbsLinks';
import { wbsDevInfoLinksApi, type WbsDevInfoLink } from '../api/wbsDevInfoLinks';
import { wbsDependenciesApi } from '../api/wbsDependencies';
import { devInfoApi } from '../api/devinfo';
import { DevInfoPicker } from '../components/DevInfoPicker';
import { GanttChart } from './wbs/GanttChart';
import { ReschedulePreviewModal } from './wbs/ReschedulePreviewModal';
import { SortableWbsRow } from './wbs/SortableWbsRow';
import { WbsKanban } from './wbs/WbsKanban';
import { WbsDragOverlayRow } from './wbs/WbsDragOverlayRow';
import { computeSiblingReorder } from './wbs/wbsReorder';
import { useHighlightFromQuery } from '../hooks/useHighlightFromQuery';
import { useCreateForm } from '../hooks/useCreateForm';
import type { WbsItem, WbsSubtask, WbsVersion, Resource, WbsStatus, Issue, IssueWbsLinkType, DevInfoItem, WbsDependency, WbsDependencyType, RescheduleResult } from '../types';
import { linkTypeOptions } from '../utils/issueWbsLinkType';
import { loadSettings, patchSettings } from '../store/settings';
import { loadWbsFilters, saveWbsFilters, clearWbsFilters, type StoredWbsFilters } from '../utils/wbsFilterStore';
import { listSavedViews, saveView, deleteView, type SavedWbsView } from '../utils/wbsSavedViews';

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
  parentId: number | null; actualStartDate: string; completedDate: string; estimateHours: string;
};

const PICKER_VIEWPORT_MARGIN = 8;

// 부모 작업 선택 — 트리 드롭다운을 portal+fixed 로 띄워 컬럼 overflow/높이에 안 잡히게 한다(CategoryCombobox 패턴).
// 버튼 아래로 펼치되 뷰포트 하단 공간 부족 시 위로 flip. 스크롤/리사이즈/외부클릭 시 닫는다.
function ParentPickerField({ value, items, excludeIds, descendantCount, onSelect }: {
  value: number | null;
  items: WbsItem[];
  excludeIds: Set<number>;
  descendantCount: number;
  onSelect: (id: number | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [placement, setPlacement] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = () => {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setPlacement(null);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const node = e.target as Node;
      if (btnRef.current?.contains(node) || menuRef.current?.contains(node)) return;
      setOpen(false);
    };
    // 드롭다운 내부(트리) 스크롤은 무시 — 바깥(모달/페이지)이 스크롤돼 앵커가 어긋날 때만 닫는다.
    const onScroll = (e: Event) => {
      const node = e.target as Node | null;
      if (node && menuRef.current?.contains(node)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  // 메뉴 높이 측정 후 뷰포트 하단 충돌 시 위로 flip.
  useLayoutEffect(() => {
    if (!open || !rect || !menuRef.current) return;
    const menuH = menuRef.current.offsetHeight;
    const top = rect.bottom + 4 + menuH + PICKER_VIEWPORT_MARGIN > window.innerHeight
      ? Math.max(PICKER_VIEWPORT_MARGIN, rect.top - menuH - 4)
      : rect.bottom + 4;
    setPlacement({ top, left: rect.left, width: rect.width });
  }, [open, rect, descendantCount]);

  return (
    <FormField label={t('wbs:form.parent')}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`${inputClass} text-left flex items-center justify-between`}
      >
        <span className={value == null ? 'text-muted' : 'text-primary'}>
          {findItemName(value, items)}
        </span>
        {open ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
      </button>
      {open && rect && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: placement?.top ?? rect.bottom + 4,
            left: placement?.left ?? rect.left,
            width: placement?.width ?? rect.width,
            visibility: placement ? 'visible' : 'hidden',
          }}
          className="z-50 flex flex-col gap-1 rounded-md border border-default bg-surface-2 p-2 shadow-lg"
        >
          <div className="max-h-64 overflow-auto overscroll-contain">
            <WbsTreePicker
              items={items}
              selectedId={value}
              excludeIds={excludeIds}
              onSelect={(id) => { onSelect(id); setOpen(false); }}
            />
          </div>
          {descendantCount > 0 && (
            <p className="text-xs text-muted shrink-0">
              {t('wbs:form.descendantHint', { count: descendantCount })}
            </p>
          )}
        </div>,
        document.body,
      )}
    </FormField>
  );
}

function WbsItemForm({
  projectId, versionId, parentId, initial, resources, allItems, allIssues, allDevInfo,
  onRefreshIssues, onRefreshDevInfo, onLinksChanged, onSave, onCancel,
}: {
  projectId: number; versionId?: number; parentId?: number;
  initial?: WbsItem; resources: Resource[]; allItems: WbsItem[]; allIssues: Issue[]; allDevInfo: DevInfoItem[];
  onRefreshIssues: () => void;
  onRefreshDevInfo: () => void;
  onLinksChanged: () => void;
  onSave: (createdId?: number) => void; onCancel: () => void;
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
    actualStartDate: initial?.actualStartDate?.slice(0, 10) ?? '',
    completedDate: initial?.completedDate?.slice(0, 10) ?? '',
    estimateHours: initial?.estimateHours != null ? String(initial.estimateHours) : '',
  };
  const [form, setForm] = useState<WbsFormData>(initialForm);
  const [initialSnapshot, setInitialSnapshot] = useState(() => JSON.stringify(initialForm));
  const dirty = JSON.stringify(form) !== initialSnapshot;
  // 동시성 토큰 (사이클 12) — 충돌 시 [서버 값 보기] 액션으로 갱신.
  const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState<string | undefined>(initial?.updatedAt);
  const [notesEditing, setNotesEditing] = useState(false);
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
      actualStartDate: form.actualStartDate || null,
      completedDate: form.completedDate || null,
      estimateHours: form.estimateHours.trim() === '' ? null : Number(form.estimateHours),
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
                    actualStartDate: fresh.actualStartDate?.slice(0, 10) ?? '',
                    completedDate: fresh.completedDate?.slice(0, 10) ?? '',
                    estimateHours: fresh.estimateHours != null ? String(fresh.estimateHours) : '',
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
      const created = await wbsApi.create(payload as any);
      toast.success(t('wbs:form.created', { name: form.name }));
      onSave(created.id); // 신규 행 위치로 스크롤하도록 생성 id 전달
      return;
    }
    onSave();
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title={initial ? t('wbs:form.editTitle') : t('wbs:form.addTitle')}
      size="7xl"
      fixedHeight
      dirty={dirty}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>{t('common:cancel')}</Button>
          <Button variant="primary" onClick={handleSubmit} leadingIcon={<Save size={16} />}>{t('common:save')}</Button>
        </>
      }
    >
      <div className={`grid grid-cols-1 gap-4 flex-1 min-h-0 ${initial ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
          {/* 1열 — 기본·일정. 스칼라 필드들. overflow 미설정 — InfoTip 말풍선(absolute)이 안 잘리도록(원래 좌측 컬럼 동작). */}
          <div className="flex flex-col gap-3 min-h-0">
            {initial && (
              <p className="text-xs text-muted font-semibold uppercase tracking-wide shrink-0">{t('wbs:form.colMain')}</p>
            )}
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
            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0 [&_input]:min-w-0 [&_select]:min-w-0">
              <FormField label={t('wbs:form.status')}>
                <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputClass}>
                  <option value="Planned">{t('status:wbs.Planned')}</option>
                  <option value="Waiting">{t('status:wbs.Waiting')}</option>
                  <option value="InProgress">{t('status:wbs.InProgress')}</option>
                  <option value="Done">{t('status:wbs.Done')}</option>
                </select>
              </FormField>
              <FormField label={t('wbs:form.importance')}>
                <select value={form.importance} onChange={(e) => set('importance', e.target.value)} className={inputClass}>
                  <option value="3">{t('status:importance.High')}</option>
                  <option value="2">{t('status:importance.Medium')}</option>
                  <option value="1">{t('status:importance.Low')}</option>
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0 [&_input]:min-w-0 [&_select]:min-w-0">
              <FormField label={t('wbs:form.startDate')}>
                <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputClass} />
              </FormField>
              <FormField label={t('wbs:form.endDate')}>
                <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className={inputClass} />
              </FormField>
            </div>
            {/* 실적 일자 — 상태에 따라 활성화. 착수일=진행/완료, 완료일=완료. 그 전엔 비활성(읽기 전용). */}
            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0 [&_input]:min-w-0 [&_select]:min-w-0">
              <FormField label={t('wbs:form.actualStartDate')} help={t('wbs:form.actualStartHint')}>
                <input
                  type="date"
                  value={form.actualStartDate}
                  disabled={form.status === 'Planned' || form.status === 'Waiting'}
                  onChange={(e) => set('actualStartDate', e.target.value)}
                  className={`${inputClass} ${form.status === 'Planned' || form.status === 'Waiting' ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </FormField>
              <FormField label={t('wbs:form.completedDate')} help={t('wbs:form.completedHint')}>
                <input
                  type="date"
                  value={form.completedDate}
                  disabled={form.status !== 'Done'}
                  onChange={(e) => set('completedDate', e.target.value)}
                  className={`${inputClass} ${form.status !== 'Done' ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </FormField>
            </div>
            <FormField label={t('wbs:form.estimateHours')} help={t('wbs:form.estimateHint')}>
              <input
                type="number" min={0} step={1}
                value={form.estimateHours}
                onChange={(e) => set('estimateHours', e.target.value)}
                className={inputClass}
                placeholder="0"
              />
            </FormField>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isMilestone} onChange={(e) => set('isMilestone', e.target.checked)} className="rounded" />
              <span className="text-sm text-secondary">{t('wbs:form.milestone')}</span>
            </label>
            {/* 부모 작업 — 생성·수정 모두 선택 가능. 트리는 portal+fixed 오버레이로 1열 위에 솟아남(아래로 펼치되 공간 부족 시 flip). */}
            <ParentPickerField
              value={form.parentId}
              items={allItems}
              excludeIds={excludeIds}
              descendantCount={descendantCount}
              onSelect={(id) => set('parentId', id)}
            />
          </div>

          {/* 2열 — 관계 (수정 모드만). 연관 섹션 4종. 길어지면 열 세로 스크롤. */}
          {initial && (
            <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
              <p className="text-xs text-muted font-semibold uppercase tracking-wide shrink-0">{t('wbs:form.colRelations')}</p>
              <RelatedIssuesSection
                wbsItemId={initial.id}
                projectId={projectId}
                allIssues={allIssues}
                onRefreshIssues={onRefreshIssues}
                onLinksChanged={onLinksChanged}
              />
              <RelatedWorkInfoSection
                wbsItemId={initial.id}
                projectId={projectId}
                allDevInfo={allDevInfo}
                onRefreshDevInfo={onRefreshDevInfo}
              />
              <DependenciesSection
                wbsItem={initial}
                allItems={allItems}
                onChanged={onLinksChanged}
              />
              <SubtaskSection projectId={projectId} wbsItem={initial} />
            </div>
          )}

          {/* 3열 — 상세 정보 (마크다운). 세로 가득. */}
          <div className="flex flex-col min-h-0 gap-3">
            {initial && (
              <p className="text-xs text-muted font-semibold uppercase tracking-wide shrink-0">{t('wbs:form.colDetail')}</p>
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
                  className="markdown-body markdown-body--wide flex-1 min-h-0 overflow-y-auto cursor-text bg-surface-2 border border-default rounded-md px-3 py-2 hover:border-strong transition-colors"
                >
                  <Markdown>{form.notes}</Markdown>
                </div>
              )}
            </FormField>
          </div>
        </div>
    </Modal>
  );
}

// WBS 작업의 선행 의존성(predecessors) 목록 + 추가/제거. 일정 지능(CPM·자동 리스케줄)의 입력.
// 후행(successors)은 읽기 표시. 사이클·중복·다른 프로젝트는 백엔드가 거부(토스트).
function DependenciesSection({ wbsItem, allItems, onChanged }: {
  wbsItem: WbsItem; allItems: WbsItem[]; onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [deps, setDeps] = useState<WbsDependency[]>([]);
  const [adding, setAdding] = useState(false);
  const [predId, setPredId] = useState<number | ''>('');
  const [type, setType] = useState<WbsDependencyType>('FinishToStart');
  const [lag, setLag] = useState('0');

  const load = () => wbsDependenciesApi.byWbs(wbsItem.id).then(setDeps).catch(() => setDeps([]));
  useEffect(() => { load(); }, [wbsItem.id]);

  const predecessors = useMemo(() => deps.filter((d) => d.successorId === wbsItem.id), [deps, wbsItem.id]);
  const successors = useMemo(() => deps.filter((d) => d.predecessorId === wbsItem.id), [deps, wbsItem.id]);
  // allItems 는 root 만 최상위인 중첩 트리 → 평탄화해야 leaf·하위 작업까지 후보로 노출.
  const candidates = useMemo(() => {
    const existing = new Set(predecessors.map((p) => p.predecessorId));
    return flattenWbsTree(allItems).filter(({ item }) => item.id !== wbsItem.id && !existing.has(item.id));
  }, [allItems, wbsItem.id, predecessors]);

  const nameOf = (id: number) => findItemName(id, allItems);
  const depTypes: WbsDependencyType[] = ['FinishToStart', 'StartToStart', 'FinishToFinish', 'StartToFinish'];

  const handleAdd = async () => {
    if (predId === '') return;
    try {
      await wbsDependenciesApi.create(Number(predId), wbsItem.id, type, parseInt(lag) || 0);
      setAdding(false); setPredId(''); setLag('0'); setType('FinishToStart');
      load(); onChanged();
    } catch { /* api/client.ts 가 사이클·중복 토스트 처리 */ }
  };

  const handleRemove = async (predecessorId: number) => {
    await wbsDependenciesApi.delete(predecessorId, wbsItem.id);
    load(); onChanged();
  };

  return (
    <div className="shrink-0 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted font-medium flex items-center gap-1">
          <GitBranch size={12} /> {t('wbs:deps.title', { count: predecessors.length })}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setAdding((v) => !v)} leadingIcon={<Plus size={12} />}>
          {adding ? t('common:close') : t('wbs:deps.add')}
        </Button>
      </div>
      {predecessors.length === 0 && !adding ? (
        <p className="text-xs text-muted italic">{t('wbs:deps.none')}</p>
      ) : (
        <ul className="space-y-1">
          {predecessors.map((d) => (
            <li key={d.id} className="flex items-center gap-2 bg-surface-2 border border-default rounded px-2 py-1 text-sm">
              <span className="text-[10px] px-1 py-0.5 rounded bg-surface-3 text-muted shrink-0">
                {t(`wbs:deps.type.${d.type}`)}{d.lagDays !== 0 ? ` ${d.lagDays > 0 ? '+' : ''}${d.lagDays}d` : ''}
              </span>
              <span className="flex-1 text-primary truncate">{d.predecessorName ?? nameOf(d.predecessorId)}</span>
              <button type="button" onClick={() => handleRemove(d.predecessorId)} className="p-0.5 text-on-danger hover:opacity-80 transition-opacity" title={t('wbs:deps.remove')}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {successors.length > 0 && (
        <p className="text-[11px] text-muted mt-0.5">
          {t('wbs:deps.successors', { names: successors.map((s) => s.successorName ?? nameOf(s.successorId)).join(', ') })}
        </p>
      )}
      {adding && (
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <select value={predId} onChange={(e) => setPredId(e.target.value === '' ? '' : Number(e.target.value))} className="bg-surface-2 border border-default rounded px-1.5 py-0.5 text-xs text-secondary flex-1 min-w-[120px]">
            <option value="">{t('wbs:deps.selectPred')}</option>
            {candidates.map(({ item, depth }) => (
              <option key={item.id} value={item.id}>
                {depth === 0 ? item.name : `${'─'.repeat(depth)} ${item.name}`}
              </option>
            ))}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value as WbsDependencyType)} className="bg-surface-2 border border-default rounded px-1.5 py-0.5 text-xs text-secondary">
            {depTypes.map((dt) => <option key={dt} value={dt}>{t(`wbs:deps.type.${dt}`)}</option>)}
          </select>
          <input type="number" value={lag} onChange={(e) => setLag(e.target.value)} className="w-14 bg-surface-2 border border-default rounded px-1.5 py-0.5 text-xs text-secondary" title={t('wbs:deps.lag')} />
          <Button variant="primary" size="sm" onClick={handleAdd}>{t('common:add')}</Button>
        </div>
      )}
    </div>
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

// WBS 항목의 관련 업무 정보(DevInfo) 링크 목록 + 추가/해제. 무타입 단순 연결 ("관련 정보").
// 모달 펼침 시 fetch. picker 열 때마다 업무 정보 silent refetch (다른 탭에서 만든 새 항목 즉시 반영).
function RelatedWorkInfoSection({ wbsItemId, projectId, allDevInfo, onRefreshDevInfo }: {
  wbsItemId: number; projectId: number; allDevInfo: DevInfoItem[];
  onRefreshDevInfo: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [links, setLinks] = useState<WbsDevInfoLink[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = () => wbsDevInfoLinksApi.byWbs(wbsItemId).then(setLinks).catch(() => setLinks([]));
  useEffect(() => { load(); }, [wbsItemId]);

  const excludeIds = useMemo(() => new Set(links.map((l) => l.devInfoItemId)), [links]);

  const togglePicker = () => {
    setPickerOpen((v) => {
      const next = !v;
      if (next) onRefreshDevInfo();
      return next;
    });
  };

  const handleAdd = async (devInfoItemId: number) => {
    try {
      await wbsDevInfoLinksApi.create(wbsItemId, devInfoItemId);
      setPickerOpen(false);
      load();
    } catch { /* api/client.ts 가 토스트 처리 */ }
  };

  const handleRemove = async (devInfoItemId: number, title: string) => {
    if (!await confirmDialog({
      title: t('wbs:relatedInfo.unlinkTitle'),
      message: t('wbs:relatedInfo.unlinkMessage', { title }),
      confirmLabel: t('wbs:relatedInfo.unlink'),
    })) return;
    await wbsDevInfoLinksApi.delete(wbsItemId, devInfoItemId);
    load();
  };

  return (
    <div className={pickerOpen ? 'flex flex-col min-h-0 gap-1 flex-1' : 'shrink-0 flex flex-col gap-1'}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted font-medium flex items-center gap-1">
          <Code2 size={12} /> {t('wbs:relatedInfo.title', { count: links.length })}
        </p>
        <Button variant="ghost" size="sm" onClick={togglePicker} leadingIcon={<Plus size={12} />}>
          {pickerOpen ? t('common:close') : t('wbs:relatedInfo.addLink')}
        </Button>
      </div>
      {links.length === 0 && !pickerOpen ? (
        <p className="text-xs text-muted italic">{t('wbs:relatedInfo.noLinks')}</p>
      ) : (
        <ul className="space-y-1">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 bg-surface-2 border border-default rounded px-2 py-1 text-sm">
              {l.devInfoType && (
                <Badge variant={devInfoTypeBadge[l.devInfoType].variant} size="sm">{l.devInfoType}</Badge>
              )}
              <button
                type="button"
                onClick={() => navigate(`/projects/${projectId}/devinfo?highlight=${l.devInfoItemId}`)}
                className="flex-1 text-left text-primary hover:text-accent truncate transition-colors"
              >
                {l.devInfoTitle ?? `#${l.devInfoItemId}`}
              </button>
              <span className="text-xs text-muted shrink-0">#{l.devInfoItemId}</span>
              <button
                type="button"
                onClick={() => handleRemove(l.devInfoItemId, l.devInfoTitle ?? `#${l.devInfoItemId}`)}
                className="p-0.5 text-on-danger hover:opacity-80 transition-opacity"
                title={t('wbs:relatedInfo.unlink')}
                aria-label={t('wbs:relatedInfo.unlinkAria', { title: l.devInfoTitle ?? `#${l.devInfoItemId}` })}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {pickerOpen && (
        <div className="mt-1 flex-1 min-h-0">
          <DevInfoPicker
            items={allDevInfo}
            excludeIds={excludeIds}
            onSelect={handleAdd}
          />
        </div>
      )}
    </div>
  );
}

// 경량 체크리스트(서브태스크) — 작업 양식 안에서 TODO 식 추가/완료/삭제. 토글은 즉시 영속(낙관적 갱신).
function SubtaskSection({ projectId, wbsItem }: { projectId: number; wbsItem: WbsItem }) {
  const { t } = useTranslation();
  const [subtasks, setSubtasks] = useState<WbsSubtask[]>(wbsItem.subtasks ?? []);
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const reload = useCallback(async () => {
    try { setSubtasks(await wbsApi.listSubtasks(projectId, wbsItem.id)); } catch { /* keep current */ }
  }, [projectId, wbsItem.id]);

  // 트리 GET 에 subtasks 가 실려오지만, 마운트 시 1회 최신화(상세 폼 직접 진입 등).
  useEffect(() => { reload(); }, [reload]);

  const add = async () => {
    const title = newTitle.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      const created = await wbsApi.addSubtask(projectId, wbsItem.id, title);
      setSubtasks((s) => [...s, created]);
      setNewTitle('');
    } finally { setBusy(false); }
  };

  const toggle = async (st: WbsSubtask) => {
    const next = !st.isDone;
    setSubtasks((s) => s.map((x) => (x.id === st.id ? { ...x, isDone: next } : x)));
    try { await wbsApi.updateSubtask(projectId, wbsItem.id, st.id, { isDone: next }); }
    catch { setSubtasks((s) => s.map((x) => (x.id === st.id ? { ...x, isDone: st.isDone } : x))); }
  };

  const remove = async (st: WbsSubtask) => {
    setSubtasks((s) => s.filter((x) => x.id !== st.id));
    try { await wbsApi.deleteSubtask(projectId, wbsItem.id, st.id); }
    catch { reload(); }
  };

  const beginEdit = (st: WbsSubtask) => { setEditingId(st.id); setEditingTitle(st.title); };
  const cancelEdit = () => { setEditingId(null); setEditingTitle(''); };
  const commitEdit = async (st: WbsSubtask) => {
    const title = editingTitle.trim();
    setEditingId(null);
    setEditingTitle('');
    if (!title || title === st.title) return;
    const prev = st.title;
    setSubtasks((s) => s.map((x) => (x.id === st.id ? { ...x, title } : x)));
    try { await wbsApi.updateSubtask(projectId, wbsItem.id, st.id, { title }); }
    catch { setSubtasks((s) => s.map((x) => (x.id === st.id ? { ...x, title: prev } : x))); }
  };

  const doneCount = subtasks.filter((s) => s.isDone).length;

  return (
    <FormField label={`${t('wbs:subtasks.label')}${subtasks.length > 0 ? ` (${doneCount}/${subtasks.length})` : ''}`}>
      <div className="space-y-1 bg-surface-2 border border-default rounded-md px-3 py-2">
        {subtasks.map((st) => (
          <div key={st.id} className="flex items-center gap-2 group">
            <input
              type="checkbox"
              checked={st.isDone}
              onChange={() => toggle(st)}
              className="rounded shrink-0"
              aria-label={t('wbs:subtasks.toggleAria', { title: st.title })}
            />
            {editingId === st.id ? (
              <input
                autoFocus
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitEdit(st); }
                  else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                }}
                onBlur={() => commitEdit(st)}
                aria-label={t('wbs:subtasks.editAria', { title: st.title })}
                className="flex-1 bg-surface border border-accent rounded px-1 py-0.5 text-sm text-primary focus:outline-none"
              />
            ) : (
              <span
                role="button"
                tabIndex={0}
                onClick={() => beginEdit(st)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); beginEdit(st); } }}
                title={t('wbs:subtasks.editHint')}
                className={`text-sm flex-1 break-words cursor-text ${st.isDone ? 'line-through text-muted' : 'text-primary'}`}
              >{st.title}</span>
            )}
            <button
              type="button"
              onClick={() => remove(st)}
              className="p-0.5 text-muted hover:text-on-danger opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              aria-label={t('wbs:subtasks.deleteAria', { title: st.title })}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Plus size={14} className="text-muted shrink-0" />
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder={t('wbs:subtasks.addPlaceholder')}
            className="flex-1 bg-transparent text-sm text-primary placeholder:text-muted/70 focus:outline-none border-none px-0 py-1"
          />
        </div>
      </div>
    </FormField>
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
  const [actualStart, setActualStart] = useState(item.actualStartDate?.slice(0, 10) ?? '');
  const [completed, setCompleted] = useState(item.completedDate?.slice(0, 10) ?? '');
  // 실적 일자 활성 조건 — 착수일=진행/완료, 완료일=완료. 상태는 이 모달에서 바꾸지 않음(작업 폼에서).
  const actualStartDisabled = item.status === 'Planned' || item.status === 'Waiting';
  const completedDisabled = item.status !== 'Done';

  const handleSave = async () => {
    await wbsApi.update(projectId, item.id, {
      ...item,
      startDate: start || undefined,
      endDate: end || undefined,
      actualStartDate: actualStart || undefined,
      completedDate: completed || undefined,
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
        <FormField label={t('wbs:form.actualStartDate')} hint={t('wbs:form.actualStartHint')}>
          <input
            type="date"
            value={actualStart}
            disabled={actualStartDisabled}
            onChange={(e) => setActualStart(e.target.value)}
            className={`${inputClass} ${actualStartDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          />
        </FormField>
        <FormField label={t('wbs:form.completedDate')} hint={t('wbs:form.completedHint')}>
          <input
            type="date"
            value={completed}
            disabled={completedDisabled}
            onChange={(e) => setCompleted(e.target.value)}
            className={`${inputClass} ${completedDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          />
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
  const [allDevInfo, setAllDevInfo] = useState<DevInfoItem[]>([]);
  const [linkCountByWbs, setLinkCountByWbs] = useState<Map<number, number>>(new Map());
  const [sourceCountByWbs, setSourceCountByWbs] = useState<Record<number, number>>({});
  const [currentVersion, setCurrentVersion] = useState<number | undefined>();
  const [view, setView] = useState<'table' | 'gantt' | 'kanban'>('table');
  // 트리 접힘 상태 — 표·간트 뷰가 공유(접힌 부모 id 집합). 다중 접기/펼치기 컨트롤이 조작.
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  // 임계경로(CPM) 작업 id 집합 — 간트 막대 적색 테두리 강조. 간트 뷰에서 지연 로드.
  const [criticalIds, setCriticalIds] = useState<Set<number>>(new Set());
  // 의존성 — 간트 화살표용. 간트 뷰에서 지연 로드.
  const [dependencies, setDependencies] = useState<WbsDependency[]>([]);
  // 드래그로 날짜 변경 후 후행 리스케줄 미리보기(이동할 후행이 있을 때만 모달).
  const [reschedulePreview, setReschedulePreview] = useState<RescheduleResult | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WbsItem | null>(null);
  const [dateEditing, setDateEditing] = useState<WbsItem | null>(null);
  const [addingChildOf, setAddingChildOf] = useState<number | undefined>();
  // 신규 작업 생성 후 해당 행으로 스크롤 — refresh 로 items 가 갱신되면 effect 가 행을 찾아 스크롤+하이라이트.
  const [scrollToId, setScrollToId] = useState<number | null>(null);
  const [showVersionForm, setShowVersionForm] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');
  const [keyword, setKeyword] = useState('');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [lateOnly, setLateOnly] = useState(false);
  const [overdueStartOnly, setOverdueStartOnly] = useState(false);
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
  // 멀티선택 부모 이동 — 선택 모드에서만 체크박스/플로팅 바 노출(평소 표는 기존과 동일).
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkMove, setShowBulkMove] = useState(false);
  const [bulkParentTarget, setBulkParentTarget] = useState<number | null>(null);
  const [movingBulk, setMovingBulk] = useState(false);

  useCreateForm(() => { setEditing(null); setAddingChildOf(undefined); setShowForm(true); });

  const filterOpts: WbsFilterOpts = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return {
      kw: keyword.trim().toLowerCase(),
      unassigned: unassignedOnly,
      late: lateOnly,
      overdueStart: overdueStartOnly,
      statuses: filterStatuses,
      assignees: filterAssignees,
      todayMs: t.getTime(),
    };
  }, [keyword, unassignedOnly, lateOnly, overdueStartOnly, filterStatuses, filterAssignees]);

  const assigneeOptions = useMemo(() => uniqueAssigneesSplit(items), [items]);

  // 패널 칩 필터 활성 개수 (상태·담당자·미할당·지연). 키워드는 별도(바).
  const chipFilterCount = filterStatuses.size + filterAssignees.size + (unassignedOnly ? 1 : 0) + (lateOnly ? 1 : 0) + (overdueStartOnly ? 1 : 0);

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
    setOverdueStartOnly(false);
    setFilterStatuses(new Set());
    setFilterAssignees(new Set());
    setMatchOnly(false);
  };

  // 필터 기억(persist) — 전역 옵트인(settings.rememberWbsFilters) + 프로젝트별 저장본(wbsFilterStore).
  const [rememberFilters, setRememberFilters] = useState(() => loadSettings().rememberWbsFilters);

  const currentStoredFilters = useCallback((): StoredWbsFilters => ({
    statuses: [...filterStatuses],
    assignees: [...filterAssignees],
    unassignedOnly,
    lateOnly,
    overdueStartOnly,
    matchOnly,
  }), [filterStatuses, filterAssignees, unassignedOnly, lateOnly, overdueStartOnly, matchOnly]);

  // 하이드레이션 직후 1회의 저장(아직 반영 안 된 이전 렌더 값) 을 건너뛰기 위한 플래그.
  const skipNextSaveRef = useRef(false);

  // 프로젝트 진입/전환 시 1회: 기억 ON 이면 저장본 복원, 아니면 기본값(프로젝트 간 필터 누수도 방지).
  useEffect(() => {
    skipNextSaveRef.current = true; // 곧 이어질 저장 effect 는 아직 갱신 전 값이라 스킵.
    const saved = loadSettings().rememberWbsFilters ? loadWbsFilters(pid) : null;
    if (!saved) { resetFilters(); return; }
    setKeyword('');
    setFilterStatuses(new Set(saved.statuses));
    setFilterAssignees(new Set(saved.assignees));
    setUnassignedOnly(saved.unassignedOnly);
    setLateOnly(saved.lateOnly);
    setOverdueStartOnly(saved.overdueStartOnly ?? false);
    setMatchOnly(saved.matchOnly);
  }, [pid]);

  // 기억 ON 인 동안 필터(상태·담당자·미할당·지연·matchOnly) 변경 시 저장. keyword 는 제외(일회성).
  useEffect(() => {
    const skip = skipNextSaveRef.current;
    skipNextSaveRef.current = false;
    if (!rememberFilters || skip) return;
    saveWbsFilters(pid, currentStoredFilters());
  }, [rememberFilters, currentStoredFilters, pid]);

  const handleRememberChange = (checked: boolean) => {
    setRememberFilters(checked);
    patchSettings({ rememberWbsFilters: checked });
    if (checked) saveWbsFilters(pid, currentStoredFilters());
    else clearWbsFilters(pid);
  };

  // 저장 뷰(명명 필터셋) — '필터 기억'(마지막 복원)과 별개로 명시 저장/적용.
  const [savedViews, setSavedViews] = useState<SavedWbsView[]>(() => listSavedViews(pid));
  useEffect(() => { setSavedViews(listSavedViews(pid)); }, [pid]);

  const applyView = useCallback((v: SavedWbsView) => {
    const f = v.filters;
    setKeyword('');
    setFilterStatuses(new Set(f.statuses));
    setFilterAssignees(new Set(f.assignees));
    setUnassignedOnly(f.unassignedOnly);
    setLateOnly(f.lateOnly);
    setOverdueStartOnly(f.overdueStartOnly ?? false);
    setMatchOnly(f.matchOnly);
  }, []);

  const handleSaveView = useCallback(() => {
    const name = window.prompt(t('wbs:views.namePrompt'));
    if (!name || !name.trim()) return;
    setSavedViews(saveView(pid, name.trim(), currentStoredFilters()));
  }, [pid, currentStoredFilters, t]);

  const handleDeleteView = useCallback((id: string) => {
    setSavedViews(deleteView(pid, id));
  }, [pid]);

  const matchedIds = useMemo(
    () => hasAnyFilter(filterOpts) ? collectMatchedIds(items, filterOpts) : new Set<number>(),
    [items, filterOpts],
  );

  const visibleItems = useMemo(() => {
    const base = (matchOnly && hasAnyFilter(filterOpts)) ? filterWbsTree(items, filterOpts) : items;
    return sortWbsTree(base);
  }, [items, filterOpts, matchOnly]);

  // 트리 접기/펼치기 — 표·간트 공유. 개별 토글 + 다중(모두/레벨별) 컨트롤.
  const toggleCollapse = useCallback((id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const expandAll = useCallback(() => setCollapsed(new Set()), []);
  const collapseAll = useCallback(() => setCollapsed(collectCollapsibleIds(items)), [items]);
  const collapseToLevel = useCallback((level: number) => setCollapsed(collectCollapsibleIds(items, level)), [items]);
  // 자식을 가진 부모가 하나라도 있으면 접기 컨트롤 노출. 최대 depth 도 레벨 버튼 노출 판단에 사용.
  const maxDepth = useMemo(() => flattenWbsTree(items).reduce((m, { depth }) => Math.max(m, depth), 0), [items]);
  const hasCollapsible = useMemo(() => items.some((i) => (i.children?.length ?? 0) > 0), [items]);

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
      const [is, vs, rs, ais, lks, srcCounts, dis] = await Promise.all([
        wbsApi.getByProject(pid, currentVersion),
        wbsApi.getVersions(pid),
        resourcesApi.getAll(),
        issuesApi.getByProject(pid),
        issueWbsLinksApi.byProject(pid).catch(() => []),
        changeLogsApi.getSourceCounts(pid).catch(() => ({ byIssueId: {}, byWbsItemId: {} })),
        devInfoApi.getByProject(pid).catch(() => [] as DevInfoItem[]),
      ]);
      setItems(is);
      setVersions(vs);
      setResources(rs);
      setAllIssues(ais);
      setLinkCountByWbs(computeLinkCountsByWbs(lks));
      setSourceCountByWbs(srcCounts.byWbsItemId);
      setAllDevInfo(dis);
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

  // 임계경로 + 의존성 로드 — 간트 강조·화살표용. 의존성·일정 변경 시 갱신.
  const loadCritical = useCallback(() => {
    wbsDependenciesApi.criticalPath(pid, currentVersion)
      .then((cp) => setCriticalIds(new Set(cp.items.filter((i) => i.isCritical).map((i) => i.wbsItemId))))
      .catch(() => setCriticalIds(new Set()));
    wbsDependenciesApi.byProject(pid, currentVersion)
      .then(setDependencies)
      .catch(() => setDependencies([]));
  }, [pid, currentVersion]);

  // RelatedIssuesSection 에서 link create/delete 후 카운트만 갱신 (모달 안에서 호출).
  // 의존성 변경도 같은 콜백으로 들어오므로 임계경로도 함께 갱신.
  const refreshLinkCounts = useCallback(() => {
    issueWbsLinksApi.byProject(pid).then((lks) => setLinkCountByWbs(computeLinkCountsByWbs(lks))).catch(() => {});
    loadCritical();
  }, [pid, loadCritical]);

  // 간트 뷰 진입·항목 변경 시 임계경로 갱신(표 뷰에선 불필요).
  useEffect(() => {
    if (view === 'gantt') loadCritical();
  }, [view, items, loadCritical]);

  // 드래그로 날짜 바뀐 작업의 후행 리스케줄 미리보기 — 이동 대상이 있으면 확인 모달.
  const handleDateChanged = useCallback((itemId: number) => {
    wbsDependenciesApi.reschedulePreview(pid, itemId)
      .then((r) => { if (r.shifts.length > 0) setReschedulePreview(r); })
      .catch(() => {});
  }, [pid]);

  // 기준선 캡처 — 현재 계획 일정을 baseline 으로 박제. 이후 Gantt '기준선' 토글로 고스트 막대 비교.
  const handleCaptureBaseline = useCallback(async () => {
    if (!await confirmDialog({
      title: t('wbs:baseline.captureTitle'),
      message: t('wbs:baseline.captureMessage'),
      confirmLabel: t('wbs:baseline.capture'),
    })) return;
    try {
      const r = await wbsApi.captureBaseline(pid, currentVersion);
      toast.success(t('wbs:baseline.captured', { count: r.captured }));
      refresh();
    } catch { /* api/client.ts 토스트 */ }
  }, [pid, currentVersion, refresh, t]);

  // picker 열 때마다 issues silent refetch — 다른 탭에서 만든 새 Issue 즉시 반영.
  const refreshIssues = useCallback(() => {
    issuesApi.getByProject(pid).then(setAllIssues).catch(() => {});
  }, [pid]);

  // picker 열 때마다 업무 정보 silent refetch — 다른 탭에서 만든 새 항목 즉시 반영.
  const refreshDevInfo = useCallback(() => {
    devInfoApi.getByProject(pid).then(setAllDevInfo).catch(() => {});
  }, [pid]);

  useEffect(() => { load(); }, [load]);

  useHighlightFromQuery([items.length]);

  // 신규 작업 스크롤 — scrollToId 가 설정되면 items 갱신 후 해당 행을 찾아 스크롤·하이라이트.
  // 행이 아직 없으면(refresh 미완·필터로 숨김) 다음 items 변경에서 재시도. 찾으면 1회 후 해제.
  useEffect(() => {
    if (scrollToId == null) return;
    const handle = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-highlight-id="${scrollToId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('search-highlight');
        window.setTimeout(() => el.classList.remove('search-highlight'), 1600);
        setScrollToId(null);
      }
    }, 80);
    return () => window.clearTimeout(handle);
  }, [scrollToId, items]);

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

  // 칸반 드롭 상태 변경 — 낙관적 갱신은 KanbanBoardView 가 담당하므로 여기선 영속화+재조회만.
  // 실패 시 update 가 throw → 보드가 롤백. id 로 트리에서 원본을 찾아 전체 페이로드 전송.
  const handleKanbanStatusMove = async (id: number, status: WbsStatus) => {
    const item = findItem(id, items);
    if (!item || item.status === status) return;
    const { children: _children, ...rest } = item;
    await wbsApi.update(pid, id, { ...rest, status });
    refresh();
  };

  // ===== 멀티선택 부모 이동 (F4) =====
  const toggleSelect = (id: number) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const clearSelection = () => setSelectedIds(new Set());
  const toggleSelectionMode = () => { if (selectionMode) clearSelection(); setSelectionMode((v) => !v); };
  // 표가 아닌 뷰로 전환 시 선택 모드 자동 종료(체크박스·플로팅 바는 표 전용).
  useEffect(() => { if (view !== 'table') { setSelectionMode(false); setSelectedIds(new Set()); } }, [view]);

  // 선택 + 그 자손 — 부모 이동 시 함께 옮겨지므로 강조. (이동 대상으로 들어갈 수 없는 순환 가드도 겸함.)
  const affectedIds = useMemo(() => {
    const s = new Set<number>();
    for (const id of selectedIds) for (const d of collectDescendantIds(id, items)) s.add(d);
    return s;
  }, [selectedIds, items]);

  // 실제 이동 대상 = 다른 선택 항목의 자손이 아닌 '최상위 선택'만. (자손은 상위와 함께 이동.)
  const effectiveMoveTargetIds = useMemo(
    () => [...selectedIds].filter((id) => {
      for (const a of collectAncestorIds(id, items)) if (selectedIds.has(a)) return false;
      return true;
    }),
    [selectedIds, items],
  );

  const handleBulkMove = async (parentId: number | null) => {
    const targets = effectiveMoveTargetIds;
    if (targets.length === 0) return;
    setMovingBulk(true);
    const results = await Promise.allSettled(targets.map((id) => {
      const item = findItem(id, items);
      if (!item) return Promise.resolve();
      const { children: _children, ...rest } = item;
      return wbsApi.update(pid, id, { ...rest, parentId: parentId ?? undefined }, { silent: true });
    }));
    setMovingBulk(false);
    const failed = results.filter((r) => r.status === 'rejected').length;
    const moved = targets.length - failed;
    if (failed > 0) toast.error(t('wbs:bulkMove.partialError', { ok: moved, failed }));
    else toast.success(t('wbs:bulkMove.moved', { count: moved }));
    setShowBulkMove(false);
    setBulkParentTarget(null);
    clearSelection();
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
            <Button
              variant={view === 'kanban' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setView('kanban')}
            >
              {t('wbs:page.viewKanban')}
            </Button>
          </div>
          {view === 'table' && items.length > 0 && (
            <Button
              variant={selectionMode ? 'primary' : 'secondary'}
              size="sm"
              onClick={toggleSelectionMode}
              leadingIcon={<ListChecks size={16} />}
              title={t('wbs:bulkMove.selectModeHint')}
            >
              {t('wbs:bulkMove.selectMode')}
            </Button>
          )}
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
              <Button
                variant="secondary"
                onClick={handleCaptureBaseline}
                leadingIcon={<Flag size={16} />}
                title={t('wbs:baseline.captureMessage')}
              >
                {t('wbs:baseline.capture')}
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
          className={inputClassSm}
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
              className={`${inputClassSm} w-24`}
            />
            <Button variant="primary" size="sm" onClick={handleCreateVersion}>{t('common:confirm')}</Button>
          </div>
        )}

        {/* 트리 다중 접기/펼치기 — 표·간트 공유(칸반은 트리 아님). 깊이에 따라 레벨 버튼 노출. */}
        {(view === 'table' || view === 'gantt') && hasCollapsible && (
          <div className="flex items-center gap-1 bg-surface border border-default rounded-md p-1">
            <Button variant="ghost" size="sm" onClick={expandAll} title={t('wbs:collapse.expandAllHint')}>{t('wbs:collapse.expandAll')}</Button>
            {maxDepth >= 2 && <Button variant="ghost" size="sm" onClick={() => collapseToLevel(2)} title={t('wbs:collapse.levelHint', { n: 2 })}>{t('wbs:collapse.level', { n: 2 })}</Button>}
            {maxDepth >= 3 && <Button variant="ghost" size="sm" onClick={() => collapseToLevel(3)} title={t('wbs:collapse.levelHint', { n: 3 })}>{t('wbs:collapse.level', { n: 3 })}</Button>}
            <Button variant="ghost" size="sm" onClick={collapseAll} title={t('wbs:collapse.collapseAllHint')}>{t('wbs:collapse.collapseAll')}</Button>
          </div>
        )}

        {/* 필터(키워드·상태·담당자·매칭만·저장뷰·기억)는 표·간트 전용 — 칸반은 자체 필터를 쓰므로 숨김. */}
        {view !== 'kanban' && (
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
                className={`${inputClassSm} pl-7 w-48`}
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
          {hasAnyFilter(filterOpts) && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              {t('common:reset')}
            </Button>
          )}
          {/* 저장 뷰(명명 필터셋) — 칩 클릭=적용, x=삭제. + 뷰 저장=현재 필터 저장. */}
          {savedViews.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {savedViews.map((v) => (
                <span key={v.id} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-surface-2 border border-default">
                  <button type="button" onClick={() => applyView(v)} className="text-secondary hover:text-accent transition-colors" title={t('wbs:views.apply')}>{v.name}</button>
                  <button type="button" onClick={() => handleDeleteView(v.id)} className="text-on-danger hover:opacity-80 transition-opacity" title={t('wbs:views.delete')} aria-label={t('wbs:views.deleteAria', { name: v.name })}><X size={10} /></button>
                </span>
              ))}
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={handleSaveView} leadingIcon={<Bookmark size={12} />} title={t('wbs:views.saveHint')}>
            {t('wbs:views.save')}
          </Button>
          <label
            className="text-xs text-muted flex items-center gap-1 cursor-pointer ml-auto"
            title={t('wbs:page.rememberFiltersHint')}
          >
            <input
              type="checkbox"
              checked={rememberFilters}
              onChange={(e) => handleRememberChange(e.target.checked)}
              className="rounded"
            />
            {t('wbs:page.rememberFilters')}
          </label>
        </div>
        )}
      </Card>

      {view !== 'kanban' && showFilters && (
        <Card padding="tight" className="space-y-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted w-12 shrink-0">{t('wbs:page.filterStatus')}</span>
            {(['Planned', 'Waiting', 'InProgress', 'Done'] as WbsStatus[]).map((s) => {
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
            <button
              onClick={() => setOverdueStartOnly((v) => !v)}
              className={`px-2 py-0.5 rounded border transition-colors ${
                overdueStartOnly ? 'bg-accent-soft border-accent text-accent' : 'border-default text-secondary hover:border-strong'
              }`}
              title={t('wbs:page.overdueStartTitle')}
            >
              {t('wbs:page.overdueStart')}
            </button>
            {/* '매칭만' — 상태 행 우측에 항상 고정(필터 선택해도 패널 높이 불변). 표 전용, 필터 없으면 비활성. */}
            {view === 'table' && (
              <label
                className={`ml-auto flex items-center gap-1 ${hasAnyFilter(filterOpts) ? 'text-muted cursor-pointer' : 'text-muted opacity-40 cursor-not-allowed'}`}
                title={t('wbs:page.matchOnlyFull')}
              >
                <input
                  type="checkbox"
                  checked={matchOnly}
                  disabled={!hasAnyFilter(filterOpts)}
                  onChange={(e) => setMatchOnly(e.target.checked)}
                />
                {t('wbs:page.matchOnly')}
              </label>
            )}
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
            criticalIds={criticalIds}
            dependencies={dependencies}
            onDateChanged={handleDateChanged}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
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
      ) : view === 'kanban' ? (
        <Card padding="normal">
          <WbsKanban
            items={items}
            onMoveStatus={handleKanbanStatusMove}
            onOpen={setEditing}
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
                        filterActive={hasAnyFilter(filterOpts)}
                        selectedIds={selectionMode ? selectedIds : undefined}
                        affectedIds={selectionMode ? affectedIds : undefined}
                        onToggleSelect={selectionMode ? toggleSelect : undefined}
                        collapsedIds={collapsed}
                        onToggleCollapse={toggleCollapse}
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
          allDevInfo={allDevInfo}
          onRefreshIssues={refreshIssues}
          onRefreshDevInfo={refreshDevInfo}
          onLinksChanged={refreshLinkCounts}
          onSave={(createdId) => { setShowForm(false); setAddingChildOf(undefined); refresh(); if (createdId) setScrollToId(createdId); }}
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
          allDevInfo={allDevInfo}
          onRefreshIssues={refreshIssues}
          onRefreshDevInfo={refreshDevInfo}
          onLinksChanged={refreshLinkCounts}
          onSave={() => { setEditing(null); refresh(); }}
          onCancel={() => { setEditing(null); refresh(); }}
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
      {reschedulePreview && (
        <ReschedulePreviewModal
          projectId={pid}
          preview={reschedulePreview}
          onApplied={() => { setReschedulePreview(null); refresh(); }}
          onClose={() => setReschedulePreview(null)}
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

      {/* 멀티선택 부모이동 — 플로팅 바(fixed). 표를 밀지 않도록 오버레이. 모달보다 낮은 z. */}
      {view === 'table' && selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2 rounded-full bg-surface border border-accent shadow-lg">
          <span className="text-sm text-primary font-medium">
            {t('wbs:bulkMove.selected', { count: selectedIds.size })}
          </span>
          <Button variant="primary" size="sm" onClick={() => { setBulkParentTarget(null); setShowBulkMove(true); }} leadingIcon={<FolderTree size={14} />}>
            {t('wbs:bulkMove.action')}
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            {t('wbs:bulkMove.clear')}
          </Button>
          <button
            type="button"
            onClick={() => { clearSelection(); setSelectionMode(false); }}
            title={t('wbs:bulkMove.exit')}
            aria-label={t('wbs:bulkMove.exit')}
            className="p-1 text-muted hover:text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {showBulkMove && (
        <Modal
          open
          onClose={() => setShowBulkMove(false)}
          title={t('wbs:bulkMove.title', { count: effectiveMoveTargetIds.length })}
          size="md"
          fixedHeight
          showCloseButton
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowBulkMove(false)} leadingIcon={<X size={16} />}>
                {t('common:cancel')}
              </Button>
              <Button variant="primary" onClick={() => handleBulkMove(bulkParentTarget)} disabled={movingBulk} leadingIcon={<FolderTree size={16} />}>
                {movingBulk ? t('wbs:bulkMove.moving') : t('wbs:bulkMove.confirm')}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-2 min-h-0 h-full">
            <p className="text-xs text-muted shrink-0">{t('wbs:bulkMove.desc')}</p>
            <WbsTreePicker
              items={items}
              selectedId={bulkParentTarget}
              excludeIds={affectedIds}
              onSelect={setBulkParentTarget}
              showRoot
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
