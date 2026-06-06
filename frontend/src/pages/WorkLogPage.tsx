import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useCurrentProject } from '../hooks/useCurrentProject';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, CalendarDays, Search } from 'lucide-react';
import { worklogApi } from '../api/worklog';
import { Button, Card, Spinner, DirtyDot, inputClass } from '../components/ui';
import { applyTextareaTab } from '../utils/textareaTab';
import { useGlobalShortcut } from '../hooks/useGlobalShortcut';
import type { WorkLog } from '../types';

const DAY_LABEL_KEYS = ['worklog:day.mon', 'worklog:day.tue', 'worklog:day.wed', 'worklog:day.thu', 'worklog:day.fri'];
const FIELDS: { key: 'done' | 'plan' | 'issues'; labelKey: string; placeholderKey: string }[] = [
  { key: 'done',   labelKey: 'worklog:field.doneLabel',   placeholderKey: 'worklog:field.donePlaceholder' },
  { key: 'plan',   labelKey: 'worklog:field.planLabel',   placeholderKey: 'worklog:field.planPlaceholder' },
  { key: 'issues', labelKey: 'worklog:field.issuesLabel', placeholderKey: 'worklog:field.issuesPlaceholder' },
];

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const diff = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - diff);
  return date;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function fmtMD(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type DayEntry = { date: string; done: string; plan: string; issues: string };
type FieldKey = 'done' | 'plan' | 'issues';

export function WorkLogPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId);
  const project = useCurrentProject();
  const [searchParams, setSearchParams] = useSearchParams();
  // 검색 결과에서 ?date=YYYY-MM-DD 로 들어오면 해당 주를 초기 weekStart 로.
  const initialWeekStart = useMemo(() => {
    const dateParam = searchParams.get('date');
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const parsed = new Date(dateParam + 'T00:00:00');
      if (!Number.isNaN(parsed.getTime())) return startOfWeek(parsed);
    }
    return startOfWeek(new Date());
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps -- 의도적으로 mount 시점만 사용
  const [weekStart, setWeekStart] = useState<Date>(initialWeekStart);

  // mount 직후 ?date 쿼리는 제거 — 한 번만 의미가 있고 새로고침 시 잔존하면 혼란.
  useEffect(() => {
    if (searchParams.get('date')) {
      const next = new URLSearchParams(searchParams);
      next.delete('date');
      setSearchParams(next, { replace: true });
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [keyword, setKeyword] = useState('');

  const weekDates = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekStartIso = isoDate(weekStart);

  useEffect(() => {
    const todayIso = isoDate(new Date());
    const todayIdx = weekDates.findIndex((d) => isoDate(d) === todayIso);
    setSelectedIdx(todayIdx >= 0 ? todayIdx : 0);
  }, [weekStartIso]);

  useEffect(() => {
    if (!pid) return;
    let cancelled = false;
    setLoading(true);
    worklogApi.getWeek(pid, weekStartIso).then((logs) => {
      if (cancelled) return;
      const byDate = new Map(logs.map((l: WorkLog) => [l.date.slice(0, 10), l]));
      setEntries(weekDates.map((d) => {
        const k = isoDate(d);
        const log = byDate.get(k);
        return {
          date: k,
          done: log?.done ?? '',
          plan: log?.plan ?? '',
          issues: log?.issues ?? '',
        };
      }));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [pid, weekStartIso]);

  const updateField = (idx: number, field: FieldKey, value: string) => {
    setEntries((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const persist = async (idx: number) => {
    const e = entries[idx];
    if (!e) return;
    await worklogApi.upsert(pid, e.date, { done: e.done, plan: e.plan, issues: e.issues });
  };

  const goPrev = () => setWeekStart((w) => addDays(w, -7));
  const goNext = () => setWeekStart((w) => addDays(w, 7));
  const goThis = () => setWeekStart(startOfWeek(new Date()));

  // 키워드 매칭 day index 집합. 빈 키워드면 빈 Set (강조 안 함).
  const matchedDays = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return new Set<number>();
    const acc = new Set<number>();
    entries.forEach((e, i) => {
      if (`${e.done} ${e.plan} ${e.issues}`.toLowerCase().includes(kw)) acc.add(i);
    });
    return acc;
  }, [entries, keyword]);

  // 키워드 입력 시 첫 매칭 day 로 자동 이동.
  useEffect(() => {
    if (matchedDays.size > 0 && !matchedDays.has(selectedIdx)) {
      const first = Math.min(...matchedDays);
      setSelectedIdx(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  const weekEnd = addDays(weekStart, 4);
  const selectedEntry = entries[selectedIdx];
  const selectedDate = weekDates[selectedIdx];

  // Ctrl+N — "신규" 가 없는 페이지라 가장 자연스러운 액션: 오늘 요일로 점프 (오늘이 다른 주면 이번 주로 전환).
  useGlobalShortcut('mod+n', () => {
    const todayIso = isoDate(new Date());
    const idxInWeek = weekDates.findIndex((d) => isoDate(d) === todayIso);
    if (idxInWeek >= 0) setSelectedIdx(idxInWeek);
    else setWeekStart(startOfWeek(new Date()));
  });

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center gap-3 flex-wrap">
        <h1 className="h-page flex items-center gap-2 min-w-0">
          <CalendarDays size={18} className="text-muted shrink-0" />
          {project && (
            <>
              <span className="text-muted font-normal truncate">{project.name}</span>
              <ChevronRight size={14} className="text-muted shrink-0" />
            </>
          )}
          <span className="shrink-0">{t('worklog:title')}</span>
        </h1>
        <div className="ml-4 flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={goPrev} title={t('worklog:prevWeek')} leadingIcon={<ChevronLeft size={16} />} />
          <Button variant="secondary" size="sm" onClick={goThis}>{t('worklog:thisWeek')}</Button>
          <Button variant="secondary" size="sm" onClick={goNext} title={t('worklog:nextWeek')} leadingIcon={<ChevronRight size={16} />} />
          <span className="ml-2 text-sm text-muted">
            {t('worklog:weekRange', { start: isoDate(weekStart), end: isoDate(weekEnd) })}
          </span>
        </div>
        <div className="ml-auto relative w-64">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('worklog:searchPlaceholder')}
            className={`${inputClass} pl-7 py-1.5 text-sm`}
          />
          {keyword && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted">
              {matchedDays.size}/5
            </span>
          )}
        </div>
      </header>

      {loading ? (
        <Spinner label={t('common:loading')} />
      ) : (
        <>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-5">
            {entries.map((entry, idx) => (
              <PreviewCard
                key={entry.date}
                dayLabel={t(DAY_LABEL_KEYS[idx])}
                date={weekDates[idx]}
                entry={entry}
                selected={idx === selectedIdx}
                matched={matchedDays.has(idx)}
                dimmed={keyword.trim() !== '' && !matchedDays.has(idx)}
                onSelect={() => setSelectedIdx(idx)}
              />
            ))}
          </div>

          {selectedEntry && selectedDate && (
            <DayEditor
              dayLabel={t(DAY_LABEL_KEYS[selectedIdx])}
              date={selectedDate}
              entry={selectedEntry}
              onChange={(field, value) => updateField(selectedIdx, field, value)}
              onBlur={() => persist(selectedIdx)}
            />
          )}
        </>
      )}
    </div>
  );
}

function PreviewCard({
  dayLabel, date, entry, selected, matched, dimmed, onSelect,
}: {
  dayLabel: string;
  date: Date;
  entry: DayEntry;
  selected: boolean;
  matched?: boolean;
  dimmed?: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const isToday = isoDate(date) === isoDate(new Date());
  const borderCls = selected
    ? 'border-accent ring-1 ring-accent'
    : matched
      ? 'border-accent-2 ring-1 ring-accent-2/40'
      : 'border-default hover:border-strong';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left bg-surface border rounded-lg overflow-hidden transition-all flex flex-col h-full ${borderCls} ${dimmed ? 'opacity-50' : ''}`}
    >
      <div className={`px-3 py-2 border-b border-default flex items-baseline gap-2 shrink-0 ${isToday ? 'bg-accent-soft' : 'bg-surface-2'}`}>
        <span className={`font-semibold ${isToday ? 'text-accent' : 'text-primary'}`}>{dayLabel}</span>
        <span className="text-xs text-muted">{fmtMD(date)}</span>
        {isToday && <span className="text-[10px] text-accent uppercase tracking-wider ml-auto">Today</span>}
      </div>
      <div className="p-2 space-y-1.5 flex-1">
        {FIELDS.map((f) => (
          <PreviewField key={f.key} label={t(f.labelKey)} value={entry[f.key]} />
        ))}
      </div>
    </button>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  const empty = !value || !value.trim();
  return (
    <div>
      <div className="text-[10px] text-muted font-medium uppercase tracking-wide mb-0.5">{label}</div>
      {empty ? (
        <div className="text-xs text-muted italic leading-tight">—</div>
      ) : (
        <div className="markdown-body text-xs leading-tight max-h-[3.6em] overflow-hidden">
          <ReactMarkdown>{value}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function DayEditor({
  dayLabel, date, entry, onChange, onBlur,
}: {
  dayLabel: string;
  date: Date;
  entry: DayEntry;
  onChange: (field: FieldKey, value: string) => void;
  onBlur: () => void;
}) {
  const { t } = useTranslation();
  const isToday = isoDate(date) === isoDate(new Date());
  return (
    <Card padding="none" className="overflow-hidden">
      <div className={`px-4 py-2 border-b border-default flex items-baseline gap-2 ${isToday ? 'bg-accent-soft' : 'bg-surface-2'}`}>
        <span className={`font-semibold ${isToday ? 'text-accent' : 'text-primary'}`}>{dayLabel}</span>
        <span className="text-xs text-muted">{fmtMD(date)}</span>
        <span className="ml-2 text-xs text-muted">{t('worklog:editSelected')}</span>
        {isToday && <span className="text-[10px] text-accent uppercase tracking-wider ml-auto">Today</span>}
      </div>
      <div className="p-4 grid gap-4 grid-cols-1 md:grid-cols-3">
        {FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col">
            <label className="block text-xs text-muted mb-1 font-medium">{t(f.labelKey)}</label>
            <EditablePreviewField
              key={`${entry.date}-${f.key}`}
              value={entry[f.key]}
              placeholder={t(f.placeholderKey)}
              onChange={(v) => onChange(f.key, v)}
              onBlur={onBlur}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

function EditablePreviewField({
  value, placeholder, onChange, onBlur,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // 마지막 저장(= 외부 prop) 시점의 값. value prop 이 외부 reload 로 바뀌면 동기화.
  // dirty = 현재 value !== lastSavedRef. onBlur 시 부모가 persist 호출 후 reload 하면 useEffect 가 lastSavedRef 재동기화.
  const lastSavedRef = useRef(value);
  useEffect(() => { lastSavedRef.current = value; }, [value]);
  // eslint-disable-next-line react-hooks/refs -- 마지막 저장값(prop) 과 비교하는 dirty 플래그, 렌더 중 ref 읽기 의도적
  const dirty = editing && value !== lastSavedRef.current;

  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [editing]);

  if (editing) {
    return (
      <div className="relative">
        <DirtyDot visible={dirty} className="absolute top-2 right-2 z-10" />
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => applyTextareaTab(e, onChange)}
          onBlur={() => {
            lastSavedRef.current = value;
            onBlur();
            setEditing(false);
          }}
          placeholder={placeholder}
          rows={12}
          className="w-full text-sm font-mono resize-y px-2 py-1.5"
        />
      </div>
    );
  }

  const empty = !value || !value.trim();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className="w-full min-h-[18rem] cursor-text rounded border border-default bg-surface-2/30 hover:bg-surface-2/60 px-2 py-1.5 transition-colors"
      title={t('worklog:clickToEdit')}
    >
      {empty ? (
        <span className="text-sm text-muted italic whitespace-pre-wrap">{placeholder}</span>
      ) : (
        <div className="markdown-body markdown-body--wide text-sm">
          <ReactMarkdown>{value}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
