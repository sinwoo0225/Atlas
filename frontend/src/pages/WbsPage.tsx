import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import ReactMarkdown from 'react-markdown';
import { Plus, Pencil, X, Save, Diamond, ChevronDown, ChevronRight, CalendarDays } from 'lucide-react';
import { wbsApi } from '../api/wbs';
import { resourcesApi } from '../api/resources';
import { Button, Card, Badge, EmptyState, FormField, inputClass } from '../components/ui';
import { wbsStatusBadge, wbsImportanceBadge } from '../utils/statusMaps';
import { useThemeMode, getChartColors } from '../utils/themeColors';
import type { WbsItem, WbsVersion, Resource } from '../types';

function flattenItems(items: WbsItem[]): WbsItem[] {
  return items.flatMap((item) => [item, ...flattenItems(item.children ?? [])]);
}

function GanttChart({ items, onDoubleClick }: { items: WbsItem[]; onDoubleClick: (item: WbsItem) => void }) {
  const theme = useThemeMode();
  const colors = getChartColors(theme);

  const flat = flattenItems(items)
    .filter((i) => i.startDate && i.endDate)
    .sort((a, b) => new Date(a.startDate!).getTime() - new Date(b.startDate!).getTime());

  if (flat.length === 0) return <p className="text-muted text-sm py-4">간트 차트 표시 가능한 작업이 없습니다.</p>;

  const dates = flat.flatMap((i) => [new Date(i.startDate!).getTime(), new Date(i.endDate!).getTime()]);
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: colors.tooltipBg,
      borderColor: colors.tooltipBorder,
      textStyle: { color: colors.tooltipText },
      formatter: (p: any) => {
        const v = p.data?.value;
        if (!v) return p.name;
        const start = new Date(v[1]).toISOString().slice(0, 10);
        const end = new Date(v[2]).toISOString().slice(0, 10);
        return `${p.name}<br>${start} ~ ${end}`;
      },
    },
    grid: { left: 180, right: 30, top: 20, bottom: 30 },
    xAxis: {
      type: 'time',
      min: minDate,
      max: maxDate,
      axisLabel: { color: colors.axisText, fontSize: 11 },
      axisLine: { lineStyle: { color: colors.axisLine } },
      splitLine: { lineStyle: { color: colors.splitLine } },
    },
    yAxis: {
      data: flat.map((i) => i.name),
      axisLabel: { color: colors.axisText, fontSize: 11 },
      axisLine: { lineStyle: { color: colors.axisLine } },
    },
    series: [{
      type: 'custom',
      renderItem: (_: any, api: any) => {
        const y = api.coord([0, api.value(0)])[1];
        const x0 = api.coord([api.value(1), 0])[0];
        const x1 = api.coord([api.value(2), 0])[0];
        const h = 18;
        return {
          type: 'rect',
          shape: { x: x0, y: y - h / 2, width: Math.max(x1 - x0, 2), height: h, r: 3 },
          style: { fill: api.value(3), opacity: 0.95 },
        };
      },
      dimensions: ['y', 'start', 'end', 'color'],
      encode: { x: [1, 2], y: 0 },
      data: flat.map((item, idx) => ({
        name: item.name,
        itemId: item.id,
        value: [
          idx,
          new Date(item.startDate!).getTime(),
          new Date(item.endDate!).getTime(),
          item.parentId == null ? colors.accentBar : colors.mutedBar,
        ],
      })),
    }],
  };

  const onEvents = {
    dblclick: (params: any) => {
      const id = params?.data?.itemId;
      if (id == null) return;
      const target = flat.find((i) => i.id === id);
      if (target) onDoubleClick(target);
    },
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: Math.max(220, flat.length * 36 + 80) }}
      onEvents={onEvents}
    />
  );
}

type WbsFormData = {
  name: string; assignee: string; startDate: string; endDate: string;
  status: string; isMilestone: boolean; order: string; notes: string;
};

function WbsItemForm({
  projectId, versionId, parentId, initial, resources, onSave, onCancel
}: {
  projectId: number; versionId?: number; parentId?: number;
  initial?: WbsItem; resources: Resource[];
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
  });
  const [notesEditing, setNotesEditing] = useState(false);
  const set = (k: keyof WbsFormData, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    const payload = {
      projectId, versionId: versionId ?? null, parentId: parentId ?? null,
      name: form.name, assignee: form.assignee,
      startDate: form.startDate || null, endDate: form.endDate || null,
      status: form.status as any, isMilestone: form.isMilestone,
      order: parseInt(form.order) || 0, notes: form.notes,
    };
    if (initial) await wbsApi.update(projectId, initial.id, payload as any);
    else await wbsApi.create(payload as any);
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
            <FormField label="담당자 (리소스 선택)">
              <input
                value={form.assignee}
                onChange={(e) => set('assignee', e.target.value)}
                list="wbs-assignee-list"
                placeholder="이름을 직접 입력하거나 리소스에서 선택"
                className={inputClass}
              />
              <datalist id="wbs-assignee-list">
                {resources.map((r) => (
                  <option key={r.id} value={r.name}>{r.department ? `${r.department}` : ''}</option>
                ))}
              </datalist>
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
          </div>

          {/* 우측 - 상세 정보 (마크다운) */}
          <FormField label="상세 정보 (마크다운, 포커스 아웃 시 렌더링)">
            {notesEditing || !form.notes ? (
              <textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
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

function WbsRow({ item, projectId, depth = 0, onEdit, onDelete, onAddChild }: {
  item: WbsItem; projectId: number; depth?: number;
  onEdit: (item: WbsItem) => void; onDelete: (id: number) => void; onAddChild: (parentId: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = (item.children?.length ?? 0) > 0;
  const importance = wbsImportanceBadge(item.order);
  const status = wbsStatusBadge[item.status];

  return (
    <>
      <tr
        className="border-b border-default hover:bg-surface-2 transition-colors"
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
        <td className="py-2 px-3">
          <Badge variant={status.variant} size="sm">{status.label}</Badge>
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
          onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild} />
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

  const load = () => {
    wbsApi.getByProject(pid, currentVersion).then(setItems);
    wbsApi.getVersions(pid).then(setVersions);
  };

  useEffect(() => { load(); }, [pid, currentVersion]);
  useEffect(() => {
    resourcesApi.getAll().then(setResources).catch(() => setResources([]));
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await wbsApi.delete(pid, id);
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
      </Card>

      {view === 'gantt' ? (
        <Card padding="normal">
          <GanttChart items={items} onDoubleClick={(it) => setDateEditing(it)} />
          <p className="text-xs text-muted mt-2">바를 더블클릭하면 날짜를 수정할 수 있습니다.</p>
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
              {items.map((item) => (
                <WbsRow
                  key={item.id}
                  item={item}
                  projectId={pid}
                  onEdit={setEditing}
                  onDelete={handleDelete}
                  onAddChild={(parentId) => { setAddingChildOf(parentId); setShowForm(true); }}
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
          onSave={() => { setShowForm(false); setAddingChildOf(undefined); load(); }}
          onCancel={() => { setShowForm(false); setAddingChildOf(undefined); }}
        />
      )}
      {editing && (
        <WbsItemForm
          projectId={pid}
          initial={editing}
          resources={resources}
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
