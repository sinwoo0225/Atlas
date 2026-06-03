import { useEffect, useMemo, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  GripHorizontal, Pin, PinOff, X, Plus, Check, Music, Play, Pause, SkipBack, SkipForward,
  AppWindow, Eye, EyeOff, MapPin, Sun, Moon, Cloud, CloudSun, CloudRain, CloudSnow, CloudFog,
  CloudLightning, CloudDrizzle, Maximize2, Minimize2, type LucideIcon,
} from 'lucide-react';
import { monitoringApi } from '../api/monitoring';
import { issuesApi } from '../api/issues';
import { projectsApi } from '../api/projects';
import { wbsApi } from '../api/wbs';
import { changeLogsApi } from '../api/changelogs';
import { resourcesApi } from '../api/resources';
import { systemApi, type GeoResult, type WeatherNow } from '../api/system';
import type { TodayWbs, IssuePriority, Project, WbsStatus, ImpactLevel, ResourceType } from '../types';
import { applyAppearance, loadSettings, patchSettings } from '../store/settings';
import { isCustomDark } from '../utils/themeCustom';
import {
  isHostBridgeAvailable, beginWidgetDrag, beginWidgetResize, setWidgetWidth, setWidgetOpacity, setWidgetPinned, closeWidget,
  onMediaUpdate, mediaControl, mediaSeek, requestMedia, type MediaState,
  onActiveWindowsUpdate, setActiveWindowsEnabled, requestActiveWindows, type ActiveWindowItem,
} from '../utils/hostBridge';

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// 오늘 기준 endDate 까지 남은 일수. 음수면 지났음.
function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

interface Badge { labelKey: string; cls: string; }
function statusBadge(tw: TodayWbs): Badge {
  const dd = daysUntil(tw.endDate);
  if (tw.status === 'Done') return { labelKey: 'widget:status.done', cls: 'bg-success-soft text-on-success' };
  if (dd !== null && dd < 0) return { labelKey: 'widget:status.delayed', cls: 'bg-danger-soft text-on-danger' };
  if (tw.status === 'InProgress') return { labelKey: 'widget:status.inProgress', cls: 'bg-info-soft text-on-info' };
  return { labelKey: 'widget:status.planned', cls: 'bg-neutral-soft text-on-neutral' };
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const { t } = useTranslation();
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const ss = String(now.getSeconds()).padStart(2, '0');
  return (
    <div className="min-w-0">
      <div className="flex items-end gap-1.5">
        <span className="text-[40px] leading-none font-bold tracking-tight tabular-nums text-primary">{hm}</span>
        <span className="text-base font-semibold text-muted tabular-nums mb-0.5">{ss}</span>
      </div>
      <div className="mt-1.5 text-xs text-secondary">
        {now.getFullYear()}. {now.getMonth() + 1}. {now.getDate()} ({t('widget:weekday.' + WEEKDAY_KEYS[now.getDay()])})
      </div>
    </div>
  );
}

// WMO weather_code → 라벨 + 아이콘.
function weatherInfo(code: number, isDay: boolean): { labelKey: string; Icon: LucideIcon } {
  if (code === 0) return { labelKey: 'widget:weather.clear', Icon: isDay ? Sun : Moon };
  if (code === 1 || code === 2) return { labelKey: 'widget:weather.mostlyClear', Icon: CloudSun };
  if (code === 3) return { labelKey: 'widget:weather.cloudy', Icon: Cloud };
  if (code === 45 || code === 48) return { labelKey: 'widget:weather.fog', Icon: CloudFog };
  if (code >= 51 && code <= 57) return { labelKey: 'widget:weather.drizzle', Icon: CloudDrizzle };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { labelKey: 'widget:weather.rain', Icon: CloudRain };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { labelKey: 'widget:weather.snow', Icon: CloudSnow };
  if (code >= 95) return { labelKey: 'widget:weather.thunder', Icon: CloudLightning };
  return { labelKey: 'widget:weather.cloudy', Icon: Cloud };
}

function Weather() {
  const { t } = useTranslation();
  const s0 = loadSettings();
  const [loc, setLoc] = useState<{ lat: number | null; lon: number | null; label: string }>({
    lat: s0.widgetWeatherLat, lon: s0.widgetWeatherLon, label: s0.widgetWeatherLabel,
  });
  const [data, setData] = useState<WeatherNow | null>(null);
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (loc.lat == null || loc.lon == null) return;
    const load = () => systemApi.getWeather(loc.lat!, loc.lon!).then(setData).catch(() => {});
    load();
    const id = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [loc.lat, loc.lon]);

  const search = async () => {
    if (!q.trim()) return;
    setSearching(true);
    try { const r = await systemApi.geocodeWeather(q.trim()); setResults(r.results ?? []); }
    catch { setResults([]); }
    finally { setSearching(false); }
  };
  const pick = (g: GeoResult) => {
    patchSettings({ widgetWeatherLat: g.lat, widgetWeatherLon: g.lon, widgetWeatherLabel: g.label });
    setLoc({ lat: g.lat, lon: g.lon, label: g.label });
    setData(null);
    setEditing(false); setResults([]); setQ('');
  };

  if (editing) {
    return (
      <div className="ml-auto w-[160px] shrink-0">
        <div className="flex gap-1">
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
            placeholder={t('widget:citySearch')}
            className="flex-1 min-w-0 text-[12px] px-2 py-1 rounded-md bg-surface-2 text-primary border border-default outline-none"
          />
          <button onClick={() => setEditing(false)} className="text-muted hover:text-secondary px-1" title={t('common:cancel')}><X size={14} /></button>
        </div>
        {searching && <div className="text-[10px] text-muted mt-1">{t('widget:searching')}</div>}
        <div className="mt-1 max-h-28 overflow-y-auto">
          {results.map((g, i) => (
            <button key={`${g.lat}-${i}`} onClick={() => pick(g)}
              className="w-full text-left text-[11px] px-2 py-1 rounded hover:bg-surface-2 text-secondary truncate">
              {g.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (loc.lat == null || loc.lon == null) {
    return (
      <button onClick={() => setEditing(true)}
        className="ml-auto self-start text-[11px] text-muted hover:text-secondary flex items-center gap-1">
        <MapPin size={12} /> {t('widget:weatherSetup')}
      </button>
    );
  }

  const info = data ? weatherInfo(data.code, data.isDay) : null;
  return (
    <button onClick={() => setEditing(true)} className="ml-auto text-right shrink-0 flex flex-col items-end" title={t('widget:changeLocation')}>
      {data && info ? (
        <>
          <div className="flex items-center gap-1.5">
            <info.Icon size={22} className="text-accent-2" />
            <span className="text-2xl font-bold text-primary leading-none">{Math.round(data.tempC)}°</span>
          </div>
          <div className="text-[11px] text-secondary mt-1">
            {t(info.labelKey)}{data.feelsC != null ? t('widget:feelsLike', { temp: Math.round(data.feelsC) }) : ''}
          </div>
          <div className="text-[10px] text-muted truncate max-w-[130px]">{loc.label}</div>
        </>
      ) : <span className="text-[11px] text-muted">{t('widget:weatherLoading')}</span>}
    </button>
  );
}

function TodayTasks() {
  const { t } = useTranslation();
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
        {t('widget:todayTasks')}
        {items && <span className="ml-auto font-semibold text-secondary normal-case tracking-normal">{t('widget:count', { count: items.length })}</span>}
      </h4>
      {items === null && <p className="text-xs text-muted py-3 text-center">{t('common:loading')}</p>}
      {items !== null && items.length === 0 && (
        <p className="text-xs text-muted py-4 text-center">{t('widget:noTodayTasks')}</p>
      )}
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.name}>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-accent mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" /> {g.name}
            </p>
            {g.rows.map((tw) => {
              const b = statusBadge(tw);
              const dd = daysUntil(tw.endDate);
              const done = tw.status === 'Done';
              return (
                <div key={tw.wbsItemId} className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-surface-2">
                  <button
                    type="button"
                    onClick={() => toggleDone(tw)}
                    disabled={busy === tw.wbsItemId}
                    title={done ? t('widget:uncomplete') : t('widget:complete')}
                    aria-label={done ? t('widget:uncomplete') : t('widget:complete')}
                    className={`w-4 h-4 rounded shrink-0 flex items-center justify-center border-[1.5px] transition-colors disabled:opacity-50 ${
                      done ? 'bg-accent border-accent text-on-accent' : 'border-strong hover:border-accent'
                    }`}
                  >
                    {done && <Check size={11} strokeWidth={3} />}
                  </button>
                  <span className={`flex-1 min-w-0 truncate text-[13px] ${done ? 'text-muted line-through' : 'text-primary'}`}>{tw.wbsItemName}</span>
                  {tw.assignee && <span className="text-[11px] text-muted shrink-0 max-w-[72px] truncate">{tw.assignee}</span>}
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${b.cls}`}>{t(b.labelKey)}</span>
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

const QC_INPUT = 'w-full text-[13px] px-2.5 py-2 rounded-md bg-surface-2 text-primary border border-default outline-none';

const PRIORITIES: { value: IssuePriority; labelKey: string }[] = [
  { value: 'Low', labelKey: 'widget:priority.low' },
  { value: 'Medium', labelKey: 'widget:priority.medium' },
  { value: 'High', labelKey: 'widget:priority.high' },
];
const IMPACTS: { value: ImpactLevel; labelKey: string }[] = [
  { value: 'Low', labelKey: 'widget:impact.low' },
  { value: 'Medium', labelKey: 'widget:impact.medium' },
  { value: 'High', labelKey: 'widget:impact.high' },
  { value: 'Critical', labelKey: 'widget:impact.critical' },
];
const todayStr = () => new Date().toISOString().slice(0, 10);

function SaveButton({ onClick, disabled, saving }: { onClick: () => void; disabled: boolean; saving: boolean }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick} disabled={disabled}
      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-[13px] font-semibold bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {saving ? <Check size={15} /> : <Plus size={15} />} {t('widget:register')}
    </button>
  );
}

function ProjectSelect({ projects, value, onChange }: { projects: Project[]; value: number | null; onChange: (id: number) => void }) {
  return (
    <select className={QC_INPUT} value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))}>
      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}

function QuickIssue({ projects }: { projects: Project[] }) {
  const { t } = useTranslation();
  const [projectId, setProjectId] = useState<number | null>(projects[0]?.id ?? null);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<IssuePriority>('Medium');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (projectId == null && projects[0]) setProjectId(projects[0].id); }, [projects, projectId]);

  const submit = async () => {
    if (!projectId || !title.trim() || saving) return;
    setSaving(true);
    try {
      await issuesApi.create({ projectId, title: title.trim(), description: '', status: 'Open', priority, assigneeResourceId: null, dueDate: dueDate || undefined });
      toast.success(t('widget:toast.issueAdded'));
      setTitle(''); setDueDate('');
    } catch { /* client toast */ } finally { setSaving(false); }
  };

  return (
    <div className="space-y-2.5">
      <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} />
      <input className={QC_INPUT} placeholder={t('widget:issueTitle')} value={title} onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }} />
      <div className="flex gap-2">
        <select className={QC_INPUT} value={priority} onChange={(e) => setPriority(e.target.value as IssuePriority)}>
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{t(p.labelKey)}</option>)}
        </select>
        <input className={QC_INPUT} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <SaveButton onClick={submit} disabled={!title.trim() || saving} saving={saving} />
    </div>
  );
}

function QuickChangelog({ projects }: { projects: Project[] }) {
  const { t } = useTranslation();
  const [projectId, setProjectId] = useState<number | null>(projects[0]?.id ?? null);
  const [date, setDate] = useState(todayStr());
  const [impact, setImpact] = useState<ImpactLevel>('Low');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (projectId == null && projects[0]) setProjectId(projects[0].id); }, [projects, projectId]);

  const submit = async () => {
    if (!projectId || !content.trim() || saving) return;
    setSaving(true);
    try {
      await changeLogsApi.create({ projectId, date, content: content.trim(), impact, relatedDocLinks: '', sourceIssueId: null, sourceWbsItemId: null });
      toast.success(t('widget:toast.changelogAdded'));
      setContent('');
    } catch { /* client toast */ } finally { setSaving(false); }
  };

  return (
    <div className="space-y-2.5">
      <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} />
      <div className="flex gap-2">
        <input className={QC_INPUT} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <select className={QC_INPUT} value={impact} onChange={(e) => setImpact(e.target.value as ImpactLevel)}>
          {IMPACTS.map((p) => <option key={p.value} value={p.value}>{t(p.labelKey)}</option>)}
        </select>
      </div>
      <textarea className={`${QC_INPUT} resize-none`} rows={3} placeholder={t('widget:changeContent')} value={content} onChange={(e) => setContent(e.target.value)} />
      <SaveButton onClick={submit} disabled={!content.trim() || saving} saving={saving} />
    </div>
  );
}

function QuickResource() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [type, setType] = useState<ResourceType>('Person');
  const [department, setDepartment] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await resourcesApi.create({ name: name.trim(), type, department: department.trim(), email: '', phone: '', notes: '' });
      toast.success(t('widget:toast.resourceAdded'));
      setName(''); setDepartment('');
    } catch { /* client toast */ } finally { setSaving(false); }
  };

  return (
    <div className="space-y-2.5">
      <input className={QC_INPUT} placeholder={t('widget:resourceName')} value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }} />
      <div className="flex gap-2">
        <select className={QC_INPUT} value={type} onChange={(e) => setType(e.target.value as ResourceType)}>
          <option value="Person">{t('widget:person')}</option>
          <option value="Equipment">{t('widget:equipment')}</option>
        </select>
        <input className={QC_INPUT} placeholder={t('widget:deptOptional')} value={department} onChange={(e) => setDepartment(e.target.value)} />
      </div>
      <SaveButton onClick={submit} disabled={!name.trim() || saving} saving={saving} />
    </div>
  );
}

type QuickEntity = 'issue' | 'changelog' | 'resource';
const QUICK_TABS: { id: QuickEntity; labelKey: string }[] = [
  { id: 'issue', labelKey: 'widget:tab.issue' },
  { id: 'changelog', labelKey: 'widget:tab.changelog' },
  { id: 'resource', labelKey: 'widget:tab.resource' },
];

function QuickCreate() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [entity, setEntity] = useState<QuickEntity>('issue');
  useEffect(() => { projectsApi.getAll().then(setProjects).catch(() => {}); }, []);

  const needsProject = entity !== 'resource';
  return (
    <section className="rounded-xl border border-default bg-surface p-3.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2.5">{t('widget:quickCreate')}</h4>
      <div className="flex gap-1 mb-3">
        {QUICK_TABS.map((tab) => (
          <button key={tab.id} onClick={() => setEntity(tab.id)}
            className={`flex-1 text-[12px] py-1.5 rounded-md border transition-colors ${
              entity === tab.id ? 'bg-accent-soft border-accent text-accent font-medium' : 'border-default text-muted hover:text-secondary'
            }`}>
            {t(tab.labelKey)}
          </button>
        ))}
      </div>
      {needsProject && projects.length === 0 ? (
        <p className="text-xs text-muted py-3 text-center">{t('widget:needProject')}</p>
      ) : entity === 'issue' ? <QuickIssue projects={projects} />
        : entity === 'changelog' ? <QuickChangelog projects={projects} />
        : <QuickResource />}
    </section>
  );
}

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function NowPlaying() {
  const { t } = useTranslation();
  const [media, setMedia] = useState<MediaState | null>(null);
  const [pos, setPos] = useState(0);

  useEffect(() => {
    const off = onMediaUpdate((m) => {
      setMedia(m);
      setPos(m.position ?? 0);
    });
    requestMedia();
    return off;
  }, []);

  // 재생 중이면 1초마다 로컬 위치를 진행(서버 푸시는 가끔 오므로 보간). mediaUpdate 마다 재동기화.
  useEffect(() => {
    if (!media?.hasSession || !media.playing || !media.hasTimeline) return;
    const id = setInterval(() => {
      setPos((p) => Math.min(p + 1, media.duration ?? p + 1));
    }, 1000);
    return () => clearInterval(id);
  }, [media?.hasSession, media?.playing, media?.hasTimeline, media?.duration]);

  if (!media?.hasSession) return null;

  const dur = media.duration ?? 0;
  const pct = media.hasTimeline && dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;

  const onSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!media.hasTimeline || dur <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setPos(frac * dur);
    mediaSeek(frac * dur);
  };

  return (
    <section className="rounded-xl border border-default bg-surface p-3.5">
      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted mb-2.5">
        <Music size={12} /> {t('widget:nowPlaying')}
      </h4>
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-lg shrink-0 overflow-hidden bg-surface-3 flex items-center justify-center">
          {media.thumbnail
            ? <img src={media.thumbnail} alt="" className="w-full h-full object-cover" />
            : <Music size={22} className="text-muted" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-primary truncate">{media.title || t('widget:notPlaying')}</div>
          <div className="text-[11px] text-muted truncate">{media.artist || ''}</div>
        </div>
      </div>

      {media.hasTimeline && (
        <div className="mt-3">
          <div className="h-1 rounded-full bg-surface-3 relative cursor-pointer" onClick={onSeek}>
            <div className="absolute left-0 top-0 bottom-0 rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between mt-1 text-[10px] tabular-nums text-muted">
            <span>{fmtTime(pos)}</span><span>{fmtTime(dur)}</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-4 mt-2.5">
        <button
          onClick={() => mediaControl('prev')} disabled={!media.canPrev}
          className="w-8 h-8 flex items-center justify-center rounded-full text-secondary hover:bg-surface-2 disabled:opacity-30"
          title={t('widget:prev')} aria-label={t('widget:prev')}
        ><SkipBack size={18} fill="currentColor" /></button>
        <button
          onClick={() => mediaControl('playpause')}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-accent text-on-accent hover:bg-accent-hover"
          title={media.playing ? t('widget:pause') : t('widget:play')} aria-label={media.playing ? t('widget:pause') : t('widget:play')}
        >{media.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
        <button
          onClick={() => mediaControl('next')} disabled={!media.canNext}
          className="w-8 h-8 flex items-center justify-center rounded-full text-secondary hover:bg-surface-2 disabled:opacity-30"
          title={t('widget:next')} aria-label={t('widget:next')}
        ><SkipForward size={18} fill="currentColor" /></button>
      </div>
    </section>
  );
}

function formatDwell(s: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (s < 60) return t('widget:dwell.sec', { n: s });
  if (s < 3600) return t('widget:dwell.min', { n: Math.floor(s / 60) });
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? t('widget:dwell.hourMin', { h, m }) : t('widget:dwell.hour', { n: h });
}

function ActiveWindows() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(() => loadSettings().widgetActiveWindowsEnabled);
  const [items, setItems] = useState<ActiveWindowItem[]>([]);

  useEffect(() => {
    const off = onActiveWindowsUpdate((s) => { setEnabled(s.enabled); setItems(s.items); });
    setActiveWindowsEnabled(loadSettings().widgetActiveWindowsEnabled);
    requestActiveWindows();
    return off;
  }, []);

  if (!isHostBridgeAvailable()) return null;

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    patchSettings({ widgetActiveWindowsEnabled: next });
    setActiveWindowsEnabled(next);
    if (!next) setItems([]);
  };

  return (
    <section className="rounded-xl border border-default bg-surface p-3.5">
      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted mb-2.5">
        <AppWindow size={12} /> {t('widget:activeWindows')}
        <button
          onClick={toggle}
          title={enabled ? t('widget:trackOff') : t('widget:trackOn')}
          className="ml-auto w-6 h-6 flex items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-secondary"
        >
          {enabled ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
      </h4>
      {!enabled ? (
        <p className="text-xs text-muted py-2 text-center">{t('widget:trackingOff')}</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted py-2 text-center">{t('widget:noWindows')}</p>
      ) : (
        <div className="space-y-0.5">
          {items.map((w, i) => (
            <div key={`${w.app}-${i}`} className="flex items-center gap-2.5 px-1 py-1.5">
              <span className="w-6 h-6 rounded-md shrink-0 flex items-center justify-center text-[10px] font-bold text-on-accent bg-accent uppercase">
                {w.app.slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-primary truncate">{w.app}</div>
                {w.title && <div className="text-[11px] text-muted truncate">{w.title}</div>}
              </div>
              <span className="text-[10px] text-muted tabular-nums shrink-0">{formatDwell(w.seconds, t)}</span>
            </div>
          ))}
        </div>
      )}
      {enabled && (
        <p className="mt-2 text-[10px] text-muted opacity-80">{t('widget:localOnly')}</p>
      )}
    </section>
  );
}

export function WidgetDashboard() {
  const { t } = useTranslation();
  const settings = loadSettings();
  const toasterTheme = settings.theme === 'custom'
    ? (isCustomDark(settings.customColors) ? 'dark' : 'light')
    : settings.theme;
  const bridge = isHostBridgeAvailable();

  const [opacity, setOpacity] = useState(92);
  const [pinned, setPinned] = useState(true);
  const [expanded, setExpanded] = useState(() => loadSettings().widgetExpanded);

  // 테마(다크/라이트)를 메인 앱과 일치시킨다. 창 둥근모서리·반투명은 네이티브가 처리.
  useEffect(() => {
    applyAppearance(loadSettings());
  }, []);

  const onOpacity = (v: number) => { setOpacity(v); setWidgetOpacity(v / 100); };
  const onPin = () => { const next = !pinned; setPinned(next); setWidgetPinned(next); };
  const onToggleLayout = () => {
    const next = !expanded;
    setExpanded(next);
    patchSettings({ widgetExpanded: next });
    setWidgetWidth(next ? 720 : 360); // 확장=2열 넓게, 컴팩트=1열
  };

  const hero = (
    <div
      className="rounded-2xl border border-default p-4 flex items-start gap-3"
      style={{ background: 'linear-gradient(135deg, var(--accent-soft), var(--bg-surface) 65%)' }}
    >
      <Clock />
      <Weather />
    </div>
  );

  return (
    <div className="h-screen w-screen overflow-hidden text-primary bg-base">
      <Toaster position="top-center" theme={toasterTheme} richColors closeButton duration={3000} />
      <div className="relative flex flex-col h-full bg-base overflow-hidden">
        {/* 타이틀바 — 드래그 핸들 + 레이아웃 토글 + 투명도 슬라이더 + 핀 + 닫기 */}
        <div
          className="flex items-center gap-2 px-3 py-2 border-b border-default select-none"
          onMouseDown={(e) => { if (e.button === 0) beginWidgetDrag(); }}
        >
          <GripHorizontal size={14} className="text-muted" />
          <span className="text-[12px] font-semibold text-secondary tracking-wide">{t('widget:title')}</span>
          <div className="flex-1" />
          {bridge && (
            <button
              onClick={onToggleLayout}
              onMouseDown={(e) => e.stopPropagation()}
              title={expanded ? t('widget:compactView') : t('widget:expandView')}
              className="w-6 h-6 flex items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-secondary mr-1"
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          )}
          {bridge && (
            <label className="flex items-center gap-1.5 mr-1" title={t('widget:opacity')} onMouseDown={(e) => e.stopPropagation()}>
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
              title={pinned ? t('widget:unpin') : t('widget:pin')}
              className={`w-6 h-6 flex items-center justify-center rounded-md ${pinned ? 'text-accent bg-accent-soft' : 'text-muted hover:bg-surface-2'}`}
            >
              {pinned ? <Pin size={14} /> : <PinOff size={14} />}
            </button>
          )}
          {bridge && (
            <button
              onClick={closeWidget}
              onMouseDown={(e) => e.stopPropagation()}
              title={t('common:close')}
              className="w-6 h-6 flex items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-secondary"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* 본문 — 컴팩트(1열) / 확장(2열) */}
        <div className="flex-1 overflow-y-auto p-3">
          {expanded ? (
            <div className="grid grid-cols-2 gap-3 items-start">
              <div className="space-y-3 min-w-0">
                {hero}
                <NowPlaying />
                <ActiveWindows />
              </div>
              <div className="space-y-3 min-w-0">
                <TodayTasks />
                <QuickCreate />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {hero}
              <NowPlaying />
              <ActiveWindows />
              <TodayTasks />
              <QuickCreate />
            </div>
          )}
        </div>

        {/* 우하단 리사이즈 그립 — 네이티브 창 리사이즈 시작 */}
        {bridge && (
          <div
            onMouseDown={(e) => { if (e.button === 0) { e.preventDefault(); beginWidgetResize(); } }}
            title={t('widget:resize')}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize text-muted"
            style={{ lineHeight: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M14 6 L6 14 M14 10 L10 14" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
