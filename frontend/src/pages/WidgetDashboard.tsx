import { useEffect, useMemo, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { GripHorizontal, Pin, PinOff, X, Plus, Check } from 'lucide-react';
import { monitoringApi } from '../api/monitoring';
import { issuesApi } from '../api/issues';
import { projectsApi } from '../api/projects';
import { wbsApi } from '../api/wbs';
import type { TodayWbs, IssuePriority, Project, WbsStatus } from '../types';
import { applyAppearance, loadSettings } from '../store/settings';
import { isCustomDark } from '../utils/themeCustom';
import {
  isHostBridgeAvailable, beginWidgetDrag, setWidgetOpacity, setWidgetPinned, closeWidget,
} from '../utils/hostBridge';

const WD = ['일', '월', '화', '수', '목', '금', '토'];

// 오늘 기준 endDate 까지 남은 일수. 음수면 지났음.
function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

interface Badge { label: string; cls: string; }
function statusBadge(t: TodayWbs): Badge {
  const dd = daysUntil(t.endDate);
  if (t.status === 'Done') return { label: '완료', cls: 'bg-success-soft text-on-success' };
  if (dd !== null && dd < 0) return { label: '지연', cls: 'bg-danger-soft text-on-danger' };
  if (t.status === 'InProgress') return { label: '진행', cls: 'bg-info-soft text-on-info' };
  return { label: '예정', cls: 'bg-neutral-soft text-on-neutral' };
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const ss = String(now.getSeconds()).padStart(2, '0');
  return (
    <div className="flex items-end gap-1.5">
      <span className="text-[44px] leading-none font-bold tracking-tight tabular-nums text-primary">{hm}</span>
      <span className="text-lg font-semibold text-muted tabular-nums mb-0.5">{ss}</span>
      <span className="ml-auto text-right text-xs text-secondary self-end mb-1">
        {now.getFullYear()}. {now.getMonth() + 1}. {now.getDate()} ({WD[now.getDay()]})
      </span>
    </div>
  );
}

function TodayTasks() {
  const [items, setItems] = useState<TodayWbs[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => monitoringApi.getToday()
      .then((d) => { if (alive) setItems(d.items); })
      .catch(() => { if (alive) setItems([]); });
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const groups = useMemo(() => {
    const map = new Map<number, { name: string; rows: TodayWbs[] }>();
    for (const it of items ?? []) {
      const g = map.get(it.projectId) ?? { name: it.projectName, rows: [] };
      g.rows.push(it);
      map.set(it.projectId, g);
    }
    return [...map.values()];
  }, [items]);

  // 체크박스 → WBS 상태 토글(완료 ↔ 진행). 동시편집 가드를 위해 전체 항목을 받아 updatedAt 포함 업데이트.
  const [busy, setBusy] = useState<number | null>(null);
  const toggleDone = async (t: TodayWbs) => {
    if (busy) return;
    setBusy(t.wbsItemId);
    try {
      const full = await wbsApi.get(t.projectId, t.wbsItemId);
      const next: WbsStatus = full.status === 'Done' ? 'InProgress' : 'Done';
      const { children: _children, ...rest } = full;
      await wbsApi.update(t.projectId, t.wbsItemId, { ...rest, status: next });
      setItems((prev) => prev?.map((x) => (x.wbsItemId === t.wbsItemId ? { ...x, status: next } : x)) ?? prev);
    } catch {
      /* client.ts 가 토스트 처리 */
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border border-default bg-surface p-3.5">
      <h4 className="flex items-center text-[11px] font-semibold uppercase tracking-wider text-muted mb-2.5">
        오늘 내 작업
        {items && <span className="ml-auto font-semibold text-secondary normal-case tracking-normal">{items.length}건</span>}
      </h4>
      {items === null && <p className="text-xs text-muted py-3 text-center">불러오는 중…</p>}
      {items !== null && items.length === 0 && (
        <p className="text-xs text-muted py-4 text-center">오늘 진행 중인 작업이 없어요.</p>
      )}
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.name}>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-accent mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" /> {g.name}
            </p>
            {g.rows.map((t) => {
              const b = statusBadge(t);
              const dd = daysUntil(t.endDate);
              const done = t.status === 'Done';
              return (
                <div key={t.wbsItemId} className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-surface-2">
                  <button
                    type="button"
                    onClick={() => toggleDone(t)}
                    disabled={busy === t.wbsItemId}
                    title={done ? '완료 해제' : '완료로 표시'}
                    aria-label={done ? '완료 해제' : '완료로 표시'}
                    className={`w-4 h-4 rounded shrink-0 flex items-center justify-center border-[1.5px] transition-colors disabled:opacity-50 ${
                      done ? 'bg-accent border-accent text-on-accent' : 'border-strong hover:border-accent'
                    }`}
                  >
                    {done && <Check size={11} strokeWidth={3} />}
                  </button>
                  <span className={`flex-1 min-w-0 truncate text-[13px] ${done ? 'text-muted line-through' : 'text-primary'}`}>{t.wbsItemName}</span>
                  {t.assignee && <span className="text-[11px] text-muted shrink-0 max-w-[72px] truncate">{t.assignee}</span>}
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${b.cls}`}>{b.label}</span>
                  {dd !== null && (
                    <span className={`shrink-0 text-[10px] font-bold tabular-nums ${dd < 0 ? 'text-on-danger' : 'text-muted'}`}>
                      {dd === 0 ? 'D-0' : dd > 0 ? `D-${dd}` : `D+${-dd}`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

const PRIORITIES: { value: IssuePriority; label: string }[] = [
  { value: 'Low', label: '낮음' },
  { value: 'Medium', label: '보통' },
  { value: 'High', label: '높음' },
];

function QuickCreateIssue() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<IssuePriority>('Medium');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    projectsApi.getAll().then((ps) => {
      setProjects(ps);
      if (ps.length > 0) setProjectId(ps[0].id);
    }).catch(() => {});
  }, []);

  const submit = async () => {
    if (!projectId || !title.trim() || saving) return;
    setSaving(true);
    try {
      await issuesApi.create({
        projectId,
        title: title.trim(),
        description: '',
        status: 'Open',
        priority,
        assigneeResourceId: null,
        dueDate: dueDate || undefined,
      });
      toast.success('이슈를 등록했어요.');
      setTitle('');
      setDueDate('');
    } catch {
      /* client.ts 가 토스트 처리 */
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full text-[13px] px-2.5 py-2 rounded-md bg-surface-2 text-primary border border-default focus:border-accent outline-none';

  return (
    <section className="rounded-xl border border-default bg-surface p-3.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2.5">빠른 작성 · 이슈</h4>
      {projects.length === 0 ? (
        <p className="text-xs text-muted py-3 text-center">프로젝트를 먼저 만들어 주세요.</p>
      ) : (
        <div className="space-y-2.5">
          <select className={inputCls} value={projectId ?? ''} onChange={(e) => setProjectId(Number(e.target.value))}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input
            className={inputCls}
            placeholder="이슈 제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          />
          <div className="flex gap-2">
            <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value as IssuePriority)}>
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <input className={inputCls} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <button
            onClick={submit}
            disabled={!title.trim() || saving}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-[13px] font-semibold bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Check size={15} /> : <Plus size={15} />} 등록
          </button>
        </div>
      )}
    </section>
  );
}

export function WidgetDashboard() {
  const settings = loadSettings();
  const toasterTheme = settings.theme === 'custom'
    ? (isCustomDark(settings.customColors) ? 'dark' : 'light')
    : settings.theme;
  const bridge = isHostBridgeAvailable();

  const [opacity, setOpacity] = useState(92);
  const [pinned, setPinned] = useState(true);

  // 테마(다크/라이트)를 메인 앱과 일치시킨다. 창 둥근모서리·반투명은 네이티브가 처리.
  useEffect(() => {
    applyAppearance(loadSettings());
  }, []);

  const onOpacity = (v: number) => { setOpacity(v); setWidgetOpacity(v / 100); };
  const onPin = () => { const next = !pinned; setPinned(next); setWidgetPinned(next); };

  return (
    <div className="h-screen w-screen overflow-hidden text-primary bg-base">
      <Toaster position="top-center" theme={toasterTheme} richColors closeButton duration={3000} />
      <div className="flex flex-col h-full bg-base overflow-hidden">
        {/* 타이틀바 — 드래그 핸들 + 투명도 슬라이더 + 핀 + 닫기 */}
        <div
          className="flex items-center gap-2 px-3 py-2 border-b border-default select-none"
          onMouseDown={(e) => { if (e.button === 0) beginWidgetDrag(); }}
        >
          <GripHorizontal size={14} className="text-muted" />
          <span className="text-[12px] font-semibold text-secondary tracking-wide">Atlas 위젯</span>
          <div className="flex-1" />
          {bridge && (
            <label className="flex items-center gap-1.5 mr-1" title="창 투명도" onMouseDown={(e) => e.stopPropagation()}>
              <input
                type="range" min={40} max={100} value={opacity}
                onChange={(e) => onOpacity(Number(e.target.value))}
                className="w-16 accent-[var(--accent)] cursor-pointer"
              />
              <span className="text-[10px] tabular-nums text-muted w-7 text-right">{opacity}%</span>
            </label>
          )}
          {bridge && (
            <button
              onClick={onPin}
              onMouseDown={(e) => e.stopPropagation()}
              title={pinned ? '항상 위 고정 해제' : '항상 위 고정'}
              className={`w-6 h-6 flex items-center justify-center rounded-md ${pinned ? 'text-accent bg-accent-soft' : 'text-muted hover:bg-surface-2'}`}
            >
              {pinned ? <Pin size={14} /> : <PinOff size={14} />}
            </button>
          )}
          {bridge && (
            <button
              onClick={closeWidget}
              onMouseDown={(e) => e.stopPropagation()}
              title="닫기"
              className="w-6 h-6 flex items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-secondary"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div
            className="rounded-2xl border border-default p-4"
            style={{ background: 'linear-gradient(135deg, var(--accent-soft), var(--bg-surface) 65%)' }}
          >
            <Clock />
          </div>
          <TodayTasks />
          <QuickCreateIssue />
        </div>
      </div>
    </div>
  );
}
