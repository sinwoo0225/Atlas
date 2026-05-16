import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { Plus, Pencil, X, Save, Diamond, ChevronDown, ChevronRight, CalendarDays, Search } from 'lucide-react';
import { wbsApi } from '../api/wbs';
import { resourcesApi } from '../api/resources';
import { Button, Card, Badge, BadgeMenu, EmptyState, FormField, inputClass } from '../components/ui';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { AssigneeTagInput } from '../components/AssigneeTagInput';
import { applyTextareaTab } from '../utils/textareaTab';
import { wbsImportanceBadge } from '../utils/statusMaps';
import {
  collectDescendantIds, collectMatchedIds, filterWbsTree, findItemName,
  hasAnyFilter, type WbsFilterOpts,
} from '../utils/wbsHelpers';
import { WbsTreePicker } from '../components/WbsTreePicker';
import { GanttChart } from './wbs/GanttChart';
import { useHighlightFromQuery } from '../hooks/useHighlightFromQuery';
import type { WbsItem, WbsVersion, Resource, WbsStatus } from '../types';

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
  projectId, versionId, parentId, initial, resources, allItems, onSave, onCancel
}: {
  projectId: number; versionId?: number; parentId?: number;
  initial?: WbsItem; resources: Resource[]; allItems: WbsItem[];
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
    }
    onSave();
  };

  return (
    <div className="modal-overlay fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card padding="spacious" className="w-full max-w-3xl my-4">
        <h2 className="h-section mb-4">{initial ? '작업 수정' : '작업 추가'}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 좌측 - 기본 필드 */}
          <div className="space-y-3">
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
              <FormField label="부모 작업">
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  className={`${inputClass} text-left flex items-center justify-between`}
                >
                  <span className={form.parentId == null ? 'text-muted' : 'text-primary'}>
                    {findItemName(form.parentId, allItems)}
                  </span>
                  {pickerOpen ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
                </button>
                {pickerOpen && (
                  <div className="mt-2">
                    <WbsTreePicker
                      items={allItems}
                      selectedId={form.parentId}
                      excludeIds={excludeIds}
                      onSelect={(id) => { set('parentId', id); setPickerOpen(false); }}
                    />
                    {descendantCount > 0 && (
                      <p className="text-xs text-muted mt-1">
                        이 항목에는 하위 작업 {descendantCount}건이 있습니다. 부모를 변경하면 함께 이동됩니다.
                      </p>
                    )}
                  </div>
                )}
              </FormField>
            )}
          </div>

          {/* 우측 - 상세 정보 (마크다운) */}
          <FormField label="상세 정보 (마크다운, 포커스 아웃 시 렌더링)">
            {notesEditing || !form.notes ? (
              <textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                onKeyDown={(e) => applyTextareaTab(e, (next) => set('notes', next))}
                onFocus={() => setNotesEditing(true)}
                onBlur={() => setNotesEditing(false)}
                rows={18}
                className={`${inputClass} resize-none font-mono`}
                placeholder="작업에 대한 상세 정보 (마크다운 지원)"
                autoFocus={notesEditing}
              />
            ) : (
              <div
                onClick={() => setNotesEditing(true)}
                className="markdown-body min-h-[280px] cursor-text bg-surface-2 border border-default rounded-md px-3 py-2 hover:border-strong transition-colors"
              >
                <ReactMarkdown>{form.notes}</ReactMarkdown>
              </div>
            )}
          </FormField>
        </div>
        <div className="flex gap-2 justify-end pt-4 border-t border-default mt-4">
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>취소</Button>
          <Button variant="primary" onClick={handleSubmit} leadingIcon={<Save size={16} />}>저장</Button>
        </div>
      </Card>
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
    <div className="modal-overlay fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <Card padding="spacious" className="w-full max-w-md space-y-3">
        <h2 className="h-section">날짜 수정 — {item.name}</h2>
        <FormField label="시작일">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="종료일">
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
        </FormField>
        <div className="flex gap-2 justify-end pt-2 border-t border-default">
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>취소</Button>
          <Button variant="primary" onClick={handleSave} leadingIcon={<Save size={16} />}>저장</Button>
        </div>
      </Card>
    </div>
  );
}

function WbsRow({ item, projectId, depth = 0, matchedIds, onEdit, onDelete, onAddChild, onStatusChange }: {
  item: WbsItem; projectId: number; depth?: number;
  matchedIds?: Set<number>;
  onEdit: (item: WbsItem) => void; onDelete: (id: number) => void;
  onAddChild: (parentId: number) => void;
  onStatusChange: (item: WbsItem, status: WbsStatus) => void;
}) {
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
              <button onClick={() => setExpanded(!expanded)} className="text-muted hover:text-primary transition-colors">
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
              className="p-1 text-muted hover:text-primary transition-colors"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={() => onEdit(item)}
              title="수정"
              className="p-1 text-muted hover:text-primary transition-colors"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              title="삭제"
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

  const load = () => {
    wbsApi.getByProject(pid, currentVersion).then(setItems);
    wbsApi.getVersions(pid).then(setVersions);
  };

  useEffect(() => { load(); }, [pid, currentVersion]);
  useEffect(() => {
    resourcesApi.getAll().then(setResources).catch(() => setResources([]));
  }, []);

  useHighlightFromQuery([items.length]);

  const handleDelete = async (id: number) => {
    if (!await confirmDialog({
      title: 'WBS 항목 삭제',
      message: '이 WBS 항목을 삭제하시겠습니까? 하위 항목도 함께 삭제되며 되돌릴 수 없습니다.',
      confirmLabel: '삭제',
      danger: true,
    })) return;
    await wbsApi.delete(pid, id);
    load();
  };

  const handleStatusChange = async (item: WbsItem, status: WbsStatus) => {
    if (item.status === status) return;
    setItems((prev) => patchStatus(prev, item.id, status));
    const { children: _children, ...rest } = item;
    await wbsApi.update(pid, item.id, { ...rest, status });
    load();
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

      {view === 'gantt' ? (
        <Card padding="normal">
          <GanttChart
            items={items}
            projectId={pid}
            onDoubleClick={(it) => setDateEditing(it)}
            onItemsChanged={load}
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
        <Card padding="none" className="overflow-hidden">
          <table className="w-full">
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
          onSave={() => { setShowForm(false); setAddingChildOf(undefined); load(); }}
          onCancel={() => { setShowForm(false); setAddingChildOf(undefined); }}
        />
      )}
      {editing && (
        <WbsItemForm
          projectId={pid}
          initial={editing}
          resources={resources}
          allItems={items}
          onSave={() => { setEditing(null); load(); }}
          onCancel={() => setEditing(null)}
        />
      )}
      {dateEditing && (
        <DateEditModal
          item={dateEditing}
          projectId={pid}
          onSave={() => { setDateEditing(null); load(); }}
          onCancel={() => setDateEditing(null)}
        />
      )}
    </div>
  );
}
