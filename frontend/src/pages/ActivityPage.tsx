import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, X, ChevronDown } from 'lucide-react';
import { activityApi, type ActivityListFilter } from '../api/activity';
import { projectsApi } from '../api/projects';
import { ActivityRow } from '../components/ActivityRow';
import { Card, Button, Skeleton } from '../components/ui';
import { ACTIVITY_TYPE_META, ACTION_META } from '../utils/activity';
import { useIntersectionLoader } from '../hooks/useIntersectionLoader';
import type {
  ActivityAction, ActivityEntityType, ActivityLog, Project,
} from '../types';

// 전역 활동 피드 — 모든 프로젝트 across 시간순. Dashboard 위젯과 동일 ActivityRow 재사용.
// 첫 로드 100건, "더 불러오기" 클릭 시 offset += PAGE_SIZE. 무한스크롤 후속.
// 필터: 프로젝트(단일) / 엔티티타입(다중) / 액션(다중) / 기간 (preset + custom). URL 쿼리로 동기화.
const PAGE_SIZE = 100;

type RangePreset = 'all' | 'today' | '7d' | '30d' | 'custom';

const ENTITY_TYPES: ActivityEntityType[] = [
  'Project', 'WbsItem', 'Issue', 'Meeting', 'ChangeLog', 'DevInfoItem', 'WorkLog', 'Resource',
];
const ACTION_KEYS: ActivityAction[] = ['Create', 'Update', 'Delete'];

function todayIso() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return isoDate(d);
}
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function addDays(iso: string, n: number) {
  const d = new Date(iso); d.setDate(d.getDate() + n);
  return isoDate(d);
}

// preset 별로 from/to 계산. 'all' 은 미적용. 'custom' 은 URL 의 from/to 그대로.
function rangeOf(preset: RangePreset, customFrom: string | null, customTo: string | null): { from: string | null; to: string | null } {
  const today = todayIso();
  switch (preset) {
    case 'today': return { from: today, to: addDays(today, 1) };
    case '7d':    return { from: addDays(today, -6), to: addDays(today, 1) };
    case '30d':   return { from: addDays(today, -29), to: addDays(today, 1) };
    case 'custom': return { from: customFrom, to: customTo ? addDays(customTo, 1) : null };
    case 'all':
    default:      return { from: null, to: null };
  }
}

export function ActivityPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [availableActors, setAvailableActors] = useState<string[]>([]);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // URL → 필터 상태
  const projectId = useMemo(() => {
    const v = searchParams.get('projectId');
    return v ? Number(v) : null;
  }, [searchParams]);
  const entityTypes = useMemo<ActivityEntityType[]>(() => {
    const raw = searchParams.get('entityType');
    if (!raw) return [];
    return raw.split(',').filter((t): t is ActivityEntityType => ENTITY_TYPES.includes(t as ActivityEntityType));
  }, [searchParams]);
  const actions = useMemo<ActivityAction[]>(() => {
    const raw = searchParams.get('action');
    if (!raw) return [];
    return raw.split(',').filter((a): a is ActivityAction => ACTION_KEYS.includes(a as ActivityAction));
  }, [searchParams]);
  const actors = useMemo<string[]>(() => {
    const raw = searchParams.get('actor');
    if (!raw) return [];
    return raw.split(',').filter(Boolean);
  }, [searchParams]);
  const preset = (searchParams.get('range') as RangePreset) || 'all';
  const customFrom = searchParams.get('from');
  const customTo = searchParams.get('to');
  const range = useMemo(() => rangeOf(preset, customFrom, customTo), [preset, customFrom, customTo]);

  // 백엔드 호출 필터
  const filter: ActivityListFilter = useMemo(() => ({
    projectId,
    entityTypes: entityTypes.length ? entityTypes : undefined,
    actions: actions.length ? actions : undefined,
    actors: actors.length ? actors : undefined,
    from: range.from,
    to: range.to,
  }), [projectId, entityTypes, actions, actors, range]);

  // 프로젝트 목록 + 액터 옵션 한 번만.
  useEffect(() => {
    projectsApi.getAll().then(setProjects).catch(() => setProjects([]));
    activityApi.getActors().then(setAvailableActors).catch(() => setAvailableActors([]));
  }, []);

  // 필터 변경 시 첫 페이지부터 다시.
  useEffect(() => {
    setLoading(true);
    setHasMore(true);
    activityApi.getAll({ ...filter, limit: PAGE_SIZE, offset: 0 })
      .then((rows) => {
        setItems(rows);
        setHasMore(rows.length === PAGE_SIZE);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [filter]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const more = await activityApi.getAll({ ...filter, limit: PAGE_SIZE, offset: items.length });
      setItems((prev) => [...prev, ...more]);
      if (more.length < PAGE_SIZE) setHasMore(false);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [filter, items.length]);

  // 무한스크롤 — sentinel 이 viewport 근처면 자동 loadMore. "더 불러오기" 버튼은 폴백.
  useIntersectionLoader(
    sentinelRef,
    !loading && !loadingMore && hasMore,
    loadMore,
  );

  const updateParam = (mut: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams);
    mut(next);
    setSearchParams(next, { replace: true });
  };
  const setMulti = (key: 'entityType' | 'action' | 'actor', values: string[]) => {
    updateParam((p) => {
      if (values.length) p.set(key, values.join(','));
      else p.delete(key);
    });
  };
  const setProject = (id: number | null) => {
    updateParam((p) => {
      if (id == null) p.delete('projectId');
      else p.set('projectId', String(id));
    });
  };
  const setPreset = (next: RangePreset) => {
    updateParam((p) => {
      if (next === 'all') p.delete('range');
      else p.set('range', next);
      if (next !== 'custom') { p.delete('from'); p.delete('to'); }
    });
  };
  const setCustom = (key: 'from' | 'to', value: string) => {
    updateParam((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
      p.set('range', 'custom');
    });
  };
  const resetAll = () => setSearchParams(new URLSearchParams(), { replace: true });

  const hasFilters = projectId != null || entityTypes.length > 0 || actions.length > 0 || actors.length > 0 || preset !== 'all';

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Activity size={20} className="text-accent" />
        <h1 className="h-page">{t('activity:title')}</h1>
      </div>

      <Card padding="normal">
        <div className="flex flex-wrap items-center gap-2">
          <ProjectFilter projects={projects} value={projectId} onChange={setProject} />
          <MultiSelect<ActivityEntityType>
            label={t('activity:filter.type')}
            values={entityTypes}
            options={ENTITY_TYPES.map((et) => ({ value: et, label: ACTIVITY_TYPE_META[et].label }))}
            onChange={(v) => setMulti('entityType', v)}
          />
          <MultiSelect<ActivityAction>
            label={t('activity:filter.action')}
            values={actions}
            options={ACTION_KEYS.map((a) => ({ value: a, label: ACTION_META[a].label }))}
            onChange={(v) => setMulti('action', v)}
          />
          <MultiSelect<string>
            label={t('activity:filter.actor')}
            values={actors}
            options={availableActors.map((a) => ({ value: a, label: a || t('activity:emptyActor') }))}
            onChange={(v) => setMulti('actor', v)}
          />
          <RangeFilter
            preset={preset}
            from={customFrom}
            to={customTo}
            onPreset={setPreset}
            onCustom={setCustom}
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetAll} leadingIcon={<X size={14} />}>
              {t('activity:reset')}
            </Button>
          )}
          {!loading && (
            <span className="ml-auto text-xs text-muted">
              {t('activity:count', { count: items.length })}{hasMore ? '+' : ''}
            </span>
          )}
        </div>
      </Card>

      <Card padding="spacious">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={28} />)}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">{t('activity:empty')}</p>
        ) : (
          <>
            <div>
              {items.map((a) => <ActivityRow key={a.id} activity={a} showProject />)}
            </div>
            {hasMore && (
              <>
                {/* sentinel — 자동 무한스크롤 트리거. 폴백 버튼은 아래 유지. */}
                <div ref={sentinelRef} aria-hidden className="h-px" />
                <div className="mt-4 flex justify-center">
                  <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? t('activity:loadingMore') : t('activity:loadMore')}
                  </Button>
                </div>
              </>
            )}
            {!hasMore && items.length > 0 && (
              <p className="mt-4 text-center text-xs text-muted">{t('activity:end')}</p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

// 외부 클릭 시 닫히는 드롭다운 컨테이너 (공용).
function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);
  return { open, setOpen, ref };
}

function FilterTrigger({
  label, summary, onClick, active,
}: { label: string; summary: string; onClick: () => void; active: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border transition-colors ${
        active
          ? 'border-accent bg-accent-soft text-on-accent-soft'
          : 'border-default bg-surface text-secondary hover:bg-surface-2'
      }`}
    >
      <span className="text-muted">{label}</span>
      <span>{summary}</span>
      <ChevronDown size={12} />
    </button>
  );
}

function ProjectFilter({
  projects, value, onChange,
}: { projects: Project[]; value: number | null; onChange: (id: number | null) => void }) {
  const { t } = useTranslation();
  const { open, setOpen, ref } = useDropdown();
  const current = value != null ? projects.find((p) => p.id === value) : null;
  const summary = current ? current.name : t('activity:all');
  return (
    <div ref={ref} className="relative">
      <FilterTrigger label={t('activity:filter.project')} summary={summary} active={value != null} onClick={() => setOpen((v) => !v)} />
      {open && (
        <div className="absolute z-20 mt-1 left-0 min-w-[220px] max-h-72 overflow-y-auto bg-surface-2 border border-default rounded-md shadow-lg py-1">
          <button
            type="button"
            onClick={() => { onChange(null); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-3 ${value == null ? 'text-primary' : 'text-secondary'}`}
          >
            {t('activity:all')}
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onChange(p.id); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-3 ${p.id === value ? 'text-primary' : 'text-secondary'}`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MultiSelect<T extends string>({
  label, values, options, onChange,
}: {
  label: string;
  values: T[];
  options: { value: T; label: string }[];
  onChange: (next: T[]) => void;
}) {
  const { t } = useTranslation();
  const { open, setOpen, ref } = useDropdown();
  const summary = values.length === 0
    ? t('activity:all')
    : values.length === 1
      ? options.find((o) => o.value === values[0])?.label ?? t('activity:oneItem')
      : t('activity:countItems', { count: values.length });
  const toggle = (v: T) => {
    if (values.includes(v)) onChange(values.filter((x) => x !== v));
    else onChange([...values, v]);
  };
  return (
    <div ref={ref} className="relative">
      <FilterTrigger label={label} summary={summary} active={values.length > 0} onClick={() => setOpen((v) => !v)} />
      {open && (
        <div className="absolute z-20 mt-1 left-0 min-w-[180px] bg-surface-2 border border-default rounded-md shadow-lg py-1">
          {options.map((o) => {
            const checked = values.includes(o.value);
            return (
              <label
                key={o.value}
                className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-surface-3"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(o.value)}
                  className="accent-accent"
                />
                <span className={checked ? 'text-primary' : 'text-secondary'}>{o.label}</span>
              </label>
            );
          })}
          {values.length > 0 && (
            <div className="border-t border-default mt-1 pt-1 px-2">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-muted hover:text-secondary py-1"
              >
                {t('activity:clearSelection')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RangeFilter({
  preset, from, to, onPreset, onCustom,
}: {
  preset: RangePreset;
  from: string | null;
  to: string | null;
  onPreset: (p: RangePreset) => void;
  onCustom: (k: 'from' | 'to', v: string) => void;
}) {
  const { t } = useTranslation();
  const { open, setOpen, ref } = useDropdown();
  const summary =
    preset === 'today' ? t('activity:range.today')
    : preset === '7d'    ? t('activity:range.last7')
    : preset === '30d'   ? t('activity:range.last30')
    : preset === 'custom' ? (from && to ? `${from} ~ ${to}` : from ? `${from} ~` : to ? `~ ${to}` : t('activity:range.custom'))
    : t('activity:all');
  return (
    <div ref={ref} className="relative">
      <FilterTrigger label={t('activity:filter.period')} summary={summary} active={preset !== 'all'} onClick={() => setOpen((v) => !v)} />
      {open && (
        <div className="absolute z-20 mt-1 left-0 min-w-[240px] bg-surface-2 border border-default rounded-md shadow-lg py-1">
          {(
            [
              { v: 'all',   label: t('activity:all') },
              { v: 'today', label: t('activity:range.today') },
              { v: '7d',    label: t('activity:range.last7') },
              { v: '30d',   label: t('activity:range.last30') },
            ] as { v: RangePreset; label: string }[]
          ).map((p) => (
            <button
              key={p.v}
              type="button"
              onClick={() => { onPreset(p.v); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-3 ${preset === p.v ? 'text-primary' : 'text-secondary'}`}
            >
              {p.label}
            </button>
          ))}
          <div className="border-t border-default mt-1 pt-2 px-3 pb-2 space-y-2">
            <p className="text-xs text-muted">{t('activity:range.custom')}</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={from ?? ''}
                onChange={(e) => onCustom('from', e.target.value)}
                className="text-xs px-2 py-1 bg-surface border border-default rounded text-secondary"
              />
              <span className="text-xs text-muted">~</span>
              <input
                type="date"
                value={to ?? ''}
                onChange={(e) => onCustom('to', e.target.value)}
                className="text-xs px-2 py-1 bg-surface border border-default rounded text-secondary"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
