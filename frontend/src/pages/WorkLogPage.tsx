import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useCurrentProject } from '../hooks/useCurrentProject';
import { Markdown } from '../components/ui/Markdown';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, CalendarDays, Search, ListPlus, LayoutList } from 'lucide-react';
import { worklogApi } from '../api/worklog';
import { Button, Card, Spinner, DirtyDot, inputClass } from '../components/ui';
import { applyTextareaTab } from '../utils/textareaTab';
import { useGlobalShortcut } from '../hooks/useGlobalShortcut';
import { WeeklyMonitoringModal } from './worklog/WeeklyMonitoringModal';
import type { WorkLog } from '../types';

const DAY_LABEL_KEYS = ['worklog:day.mon', 'worklog:day.tue', 'worklog:day.wed', 'worklog:day.thu', 'worklog:day.fri'];
// '계획'은 일지에서 제거(다음 주 계획은 통합 모니터링 주간 병합에서 제공). plan 데이터·컬럼은 보존하되 UI 비노출.
const FIELDS: { key: 'done' | 'issues'; labelKey: string; placeholderKey: string }[] = [
  { key: 'done',   labelKey: 'worklog:field.doneLabel',   placeholderKey: 'worklog:field.donePlaceholder' },
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
// 주말이면 가장 가까운 평일(금)로 — 자동 등록(백엔드 WorkLogService.ToWeekdayDate)과 일관.
// 업무일지 진입 시 기본 선택 요일에 사용(주말엔 월요일 대신 금요일이 보이도록).
function weekdayToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=일, 6=토
  if (day === 6) d.setDate(d.getDate() - 1);
  else if (day === 0) d.setDate(d.getDate() - 2);
  return d;
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
  const [weeklyOpen, setWeeklyOpen] = useState(false);

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
    const targetIso = isoDate(weekdayToday()); // 주말이면 금요일
    const idx = weekDates.findIndex((d) => isoDate(d) === targetIso);
    setSelectedIdx(idx >= 0 ? idx : 0);
  }, [weekStartIso]);

  // 주(week) 일지 응답을 5일치 DayEntry 로 매핑 (초기 로드 + 자동 작성 후 갱신 공용).
  const mapLogsToEntries = (logs: WorkLog[]): DayEntry[] => {
    const byDate = new Map(logs.map((l) => [l.date.slice(0, 10), l]));
    return weekDates.map((d) => {
      const k = isoDate(d);
      const log = byDate.get(k);
      return { date: k, done: log?.done ?? '', plan: log?.plan ?? '', issues: log?.issues ?? '' };
    });
  };

  useEffect(() => {
    if (!pid) return;
    let cancelled = false;
    setLoading(true);
    worklogApi.getWeek(pid, weekStartIso).then((logs) => {
      if (cancelled) return;
      setEntries(mapLogsToEntries(logs));
      setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, weekStartIso]);

  const [autoProgressing, setAutoProgressing] = useState(false);
  // '진행 항목 자동 작성' — 편집 중 내용 저장 후, 진행 WBS·이슈를 [시작]으로 당일 '한 일'에 추가하고 주 일지 갱신.
  const handleAutoProgress = async () => {
    const e = entries[selectedIdx];
    if (!e || autoProgressing) return;
    setAutoProgressing(true);
    try {
      await persist(selectedIdx);
      const res = await worklogApi.autoProgress(pid, e.date);
      setEntries(mapLogsToEntries(res.week));
      toast.success(t('worklog:autoProgress.done', { count: res.wbs + res.issues }));
    } finally {
      setAutoProgressing(false);
    }
  };

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
      if (`${e.done} ${e.issues}`.toLowerCase().includes(kw)) acc.add(i);
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
    const targetIso = isoDate(weekdayToday()); // 주말이면 금요일
    const idxInWeek = weekDates.findIndex((d) => isoDate(d) === targetIso);
    if (idxInWeek >= 0) setSelectedIdx(idxInWeek);
    else setWeekStart(startOfWeek(new Date()));
  });

  return (
    <div className="p-6 h-full flex flex-col gap-4 min-h-0">
      <header className="flex items-center gap-3 flex-wrap shrink-0">
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
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setWeeklyOpen(true)}
          leadingIcon={<LayoutList size={16} />}
          title={t('worklog:weeklyMonitoring.buttonHint')}
        >
          {t('worklog:weeklyMonitoring.button')}
        </Button>
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
        <div className="flex-1 min-h-0 flex flex-col gap-4">
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-5 shrink-0">
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
              onAutoProgress={handleAutoProgress}
              autoProgressing={autoProgressing}
            />
          )}
        </div>
      )}

      <WeeklyMonitoringModal open={weeklyOpen} onClose={() => setWeeklyOpen(false)} currentProjectId={pid} />
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
      className={`text-left bg-surface border rounded-lg overflow-hidden transition-all flex flex-col h-full min-h-[8.5rem] ${borderCls} ${dimmed ? 'opacity-50' : ''}`}
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
        <div className="markdown-body text-xs leading-tight max-h-[7em] overflow-hidden">
          <Markdown>{value}</Markdown>
        </div>
      )}
    </div>
  );
}

function DayEditor({
  dayLabel, date, entry, onChange, onBlur, onAutoProgress, autoProgressing,
}: {
  dayLabel: string;
  date: Date;
  entry: DayEntry;
  onChange: (field: FieldKey, value: string) => void;
  onBlur: () => void;
  onAutoProgress: () => void;
  autoProgressing: boolean;
}) {
  const { t } = useTranslation();
  const isToday = isoDate(date) === isoDate(new Date());
  return (
    <Card padding="none" className="overflow-hidden flex-1 min-h-[16rem] flex flex-col">
      <div className={`px-4 py-2 border-b border-default flex items-baseline gap-2 shrink-0 ${isToday ? 'bg-accent-soft' : 'bg-surface-2'}`}>
        <span className={`font-semibold ${isToday ? 'text-accent' : 'text-primary'}`}>{dayLabel}</span>
        <span className="text-xs text-muted">{fmtMD(date)}</span>
        <span className="ml-2 text-xs text-muted">{t('worklog:editSelected')}</span>
        {isToday && <span className="text-[10px] text-accent uppercase tracking-wider ml-auto">Today</span>}
      </div>
      <div className="p-4 flex flex-col md:flex-row gap-4 flex-1 min-h-0">
        {FIELDS.map((f) => (
          <div key={f.key} className="flex-1 min-h-0 flex flex-col">
            {/* 헤더 행 고정 높이 — '한 일'(자동작성 버튼)·'이슈'(버튼 없음)의 본문 시작선·높이 일치. */}
            <div className="flex items-center justify-between gap-2 mb-1 min-h-[30px]">
              <label className="block text-xs text-muted font-medium">{t(f.labelKey)}</label>
              {f.key === 'done' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAutoProgress}
                  disabled={autoProgressing}
                  leadingIcon={<ListPlus size={14} />}
                  title={t('worklog:autoProgress.hint')}
                >
                  {autoProgressing ? t('worklog:autoProgress.running') : t('worklog:autoProgress.button')}
                </Button>
              )}
            </div>
            <div className="flex-1 min-h-0">
              <EditablePreviewField
                key={`${entry.date}-${f.key}`}
                value={entry[f.key]}
                placeholder={t(f.placeholderKey)}
                onChange={(v) => onChange(f.key, v)}
                onBlur={onBlur}
              />
            </div>
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
      <div className="relative h-full">
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
          className="w-full h-full text-sm font-mono resize-none overflow-auto px-2 py-1.5"
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
      className="w-full h-full overflow-auto cursor-text rounded border border-default bg-surface-2/30 hover:bg-surface-2/60 px-2 py-1.5 transition-colors"
      title={t('worklog:clickToEdit')}
    >
      {empty ? (
        <span className="text-sm text-muted italic whitespace-pre-wrap">{placeholder}</span>
      ) : (
        <div className="markdown-body markdown-body--wide text-sm">
          <Markdown>{value}</Markdown>
        </div>
      )}
    </div>
  );
}
