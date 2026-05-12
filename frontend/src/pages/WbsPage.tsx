import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import ReactMarkdown from 'react-markdown';
import { Plus, Pencil, X, Save, Diamond, ChevronDown, ChevronRight, CalendarDays } from 'lucide-react';
import { wbsApi } from '../api/wbs';
import { resourcesApi } from '../api/resources';
import type { WbsItem, WbsVersion, Resource } from '../types';

const statusLabel = { Planned: '예정', InProgress: '진행', Done: '완료' };

// 중요도: 3=높음, 2=중간, 1=낮음 (0 미설정 → 중간으로 표시)
const importanceLabel = (n: number): string => {
  if (n >= 3) return '높음';
  if (n === 1) return '낮음';
  return '중간';
};
const importanceClass = (n: number): string => {
  if (n >= 3) return 'text-red-300';
  if (n === 1) return 'text-slate-400';
  return 'text-amber-300';
};

function flattenItems(items: WbsItem[]): WbsItem[] {
  return items.flatMap((item) => [item, ...flattenItems(item.children ?? [])]);
}

function GanttChart({ items, onDoubleClick }: { items: WbsItem[]; onDoubleClick: (item: WbsItem) => void }) {
  const flat = flattenItems(items)
    .filter((i) => i.startDate && i.endDate)
    .sort((a, b) => new Date(a.startDate!).getTime() - new Date(b.startDate!).getTime());

  if (flat.length === 0) return <p className="text-slate-500 text-sm py-4">간트 차트 표시 가능한 작업이 없습니다.</p>;

  const dates = flat.flatMap((i) => [new Date(i.startDate!).getTime(), new Date(i.endDate!).getTime()]);
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
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
      axisLabel: { color: '#9ca3af', fontSize: 11 },
      axisLine: { lineStyle: { color: '#3a3a3a' } },
      splitLine: { lineStyle: { color: '#2a2a2a' } },
    },
    yAxis: {
      data: flat.map((i) => i.name),
      axisLabel: { color: '#9ca3af', fontSize: 11 },
      axisLine: { lineStyle: { color: '#3a3a3a' } },
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
          item.parentId == null ? '#9ca3af' : '#6b7280',
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

  const inputClass =
    'w-full bg-zinc-800/60 border border-zinc-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-zinc-500';

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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#1f1f1f] rounded-lg p-6 w-full max-w-3xl border border-[#2a2a2a] my-4">
        <h2 className="text-base font-medium text-slate-100 mb-4">{initial ? '작업 수정' : '작업 추가'}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 좌측 - 기본 필드 */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">작업명 *</label>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">담당자 (리소스 선택)</label>
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">시작일</label>
                <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">종료일</label>
                <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className={inputClass} />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">중요도</label>
              <select value={form.order} onChange={(e) => set('order', e.target.value)} className={inputClass}>
                <option value="3">높음</option>
                <option value="2">중간</option>
                <option value="1">낮음</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">상태</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputClass}>
                <option value="Planned">예정</option>
                <option value="InProgress">진행</option>
                <option value="Done">완료</option>
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isMilestone} onChange={(e) => set('isMilestone', e.target.checked)} className="rounded" />
              <span className="text-sm text-slate-300">마일스톤</span>
            </label>
          </div>

          {/* 우측 - 상세 정보 (마크다운) */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">상세 정보 (마크다운, 포커스 아웃 시 렌더링)</label>
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
                className="markdown-body min-h-[280px] cursor-text bg-zinc-800/60 border border-zinc-700 rounded-md px-3 py-2 hover:border-zinc-500"
              >
                <ReactMarkdown>{form.notes}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-4 border-t border-[#2a2a2a] mt-4">
          <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-zinc-800 hover:bg-zinc-700 text-slate-200 transition-colors">
            <X size={14} /> 취소
          </button>
          <button onClick={handleSubmit} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
            <Save size={14} /> 저장
          </button>
        </div>
      </div>
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

  const inputClass =
    'w-full bg-zinc-800/60 border border-zinc-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-zinc-500';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1f1f1f] rounded-lg p-6 w-full max-w-md space-y-3 border border-[#2a2a2a]">
        <h2 className="text-base font-medium text-slate-100">날짜 수정 — {item.name}</h2>
        <div>
          <label className="block text-xs text-slate-400 mb-1">시작일</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">종료일</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
        </div>
        <div className="flex gap-2 justify-end pt-2 border-t border-[#2a2a2a]">
          <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-zinc-800 hover:bg-zinc-700 text-slate-200 transition-colors">
            <X size={14} /> 취소
          </button>
          <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
            <Save size={14} /> 저장
          </button>
        </div>
      </div>
    </div>
  );
}

function WbsRow({ item, projectId, depth = 0, onEdit, onDelete, onAddChild }: {
  item: WbsItem; projectId: number; depth?: number;
  onEdit: (item: WbsItem) => void; onDelete: (id: number) => void; onAddChild: (parentId: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = (item.children?.length ?? 0) > 0;
  const statusColors = {
    Planned: 'text-slate-400',
    InProgress: 'text-amber-400',
    Done: 'text-emerald-400',
  };

  return (
    <>
      <tr
        className="border-b border-[#2a2a2a] hover:bg-zinc-800/40"
        onDoubleClick={() => onEdit(item)}
      >
        <td className="py-2 px-4">
          <div className="flex items-center gap-1" style={{ paddingLeft: depth * 20 }}>
            {hasChildren ? (
              <button onClick={() => setExpanded(!expanded)} className="text-slate-400 hover:text-slate-200">
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            ) : (
              <span className="w-4 inline-block" />
            )}
            {item.isMilestone && <Diamond size={12} className="text-zinc-300" />}
            <span
              className="text-sm text-slate-100 hover:text-white cursor-pointer"
              onClick={() => onEdit(item)}
            >
              {item.name}
            </span>
          </div>
        </td>
        <td className="py-2 px-3 text-sm text-slate-400">{item.assignee}</td>
        <td className="py-2 px-3 text-xs text-slate-400">{item.startDate?.slice(0, 10)}</td>
        <td className="py-2 px-3 text-xs text-slate-400">{item.endDate?.slice(0, 10)}</td>
        <td className="py-2 px-3">
          <span className={`text-xs font-medium ${importanceClass(item.order)}`}>{importanceLabel(item.order)}</span>
        </td>
        <td className="py-2 px-3">
          <span className={`text-xs font-medium ${statusColors[item.status]}`}>{statusLabel[item.status]}</span>
        </td>
        <td className="py-2 px-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onAddChild(item.id)}
              title="하위 작업 추가"
              className="p-1 text-slate-400 hover:text-slate-200"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={() => onEdit(item)}
              title="수정"
              className="p-1 text-slate-400 hover:text-slate-200"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              title="삭제"
              className="p-1 text-red-400 hover:text-red-300"
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

  const tabClass = (active: boolean) =>
    `px-3 py-1 text-sm rounded-md transition-colors ${active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <CalendarDays size={18} className="text-slate-400" />
          일정 / WBS
        </h1>
        <div className="flex gap-2">
          <div className="flex bg-[#1f1f1f] border border-[#2a2a2a] rounded-md p-1">
            <button onClick={() => setView('table')} className={tabClass(view === 'table')}>표</button>
            <button onClick={() => setView('gantt')} className={tabClass(view === 'gantt')}>간트</button>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-medium transition-colors"
          >
            <Plus size={14} /> 작업 추가
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 bg-[#1f1f1f] border border-[#2a2a2a] rounded-md p-3">
        <span className="text-sm text-slate-400">버전:</span>
        <select
          value={currentVersion ?? ''}
          onChange={(e) => setCurrentVersion(e.target.value ? parseInt(e.target.value) : undefined)}
          className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none"
        >
          <option value="">전체</option>
          {versions.map((v) => <option key={v.id} value={v.id}>{v.versionName}{v.isCurrent ? ' (현재)' : ''}</option>)}
        </select>
        <button onClick={() => setShowVersionForm(!showVersionForm)} className="text-sm text-slate-300 hover:text-white">
          + 버전
        </button>
        {showVersionForm && (
          <div className="flex gap-2 items-center">
            <input
              value={newVersionName}
              onChange={(e) => setNewVersionName(e.target.value)}
              placeholder="v1.0"
              className="bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-sm text-slate-100 w-24 focus:outline-none"
            />
            <button onClick={handleCreateVersion} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-md">
              확인
            </button>
          </div>
        )}
      </div>

      {view === 'gantt' ? (
        <div className="bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg p-4">
          <GanttChart items={items} onDoubleClick={(it) => setDateEditing(it)} />
          <p className="text-xs text-slate-500 mt-2">바를 더블클릭하면 날짜를 수정할 수 있습니다.</p>
        </div>
      ) : (
        <div className="bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2a2a2a] text-xs text-slate-400">
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
              {items.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-sm text-slate-500">작업이 없습니다.</td></tr>
              ) : items.map((item) => (
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
        </div>
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
