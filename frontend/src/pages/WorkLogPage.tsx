import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { worklogApi } from '../api/worklog';
import type { WorkLog } from '../types';

const DAY_LABELS = ['월', '화', '수', '목', '금'];
const FIELDS: { key: 'done' | 'plan' | 'issues'; label: string; placeholder: string }[] = [
  { key: 'done',   label: '한 일',   placeholder: '- 오늘 진행한 작업\n- WBS / 이슈 완료 시 자동 추가' },
  { key: 'plan',   label: '계획',     placeholder: '- 내일 / 이번 주 계획' },
  { key: 'issues', label: '이슈',     placeholder: '- 막힌 부분 / 위험' },
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

export function WorkLogPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const weekDates = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekStartIso = isoDate(weekStart);

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

  const updateField = (idx: number, field: 'done' | 'plan' | 'issues', value: string) => {
    setEntries((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const persist = async (idx: number) => {
    const e = entries[idx];
    await worklogApi.upsert(pid, e.date, { done: e.done, plan: e.plan, issues: e.issues });
  };

  const goPrev = () => setWeekStart((w) => addDays(w, -7));
  const goNext = () => setWeekStart((w) => addDays(w, 7));
  const goThis = () => setWeekStart(startOfWeek(new Date()));

  const weekEnd = addDays(weekStart, 4);

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-primary flex items-center gap-2">
          <CalendarDays size={20} className="text-accent" />
          업무 일지
        </h1>
        <div className="ml-4 flex items-center gap-2">
          <button onClick={goPrev} className="p-1.5 rounded-md bg-surface-2 hover:bg-surface-3 text-secondary" title="이전 주">
            <ChevronLeft size={16} />
          </button>
          <button onClick={goThis} className="px-3 py-1.5 text-sm rounded-md bg-surface-2 hover:bg-surface-3 text-secondary">
            이번 주
          </button>
          <button onClick={goNext} className="p-1.5 rounded-md bg-surface-2 hover:bg-surface-3 text-secondary" title="다음 주">
            <ChevronRight size={16} />
          </button>
          <span className="ml-2 text-sm text-muted">
            {isoDate(weekStart)} (월) ~ {isoDate(weekEnd)} (금)
          </span>
        </div>
      </header>

      {loading ? (
        <div className="text-sm text-muted">로딩중…</div>
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-5">
          {entries.map((entry, idx) => (
            <DayCard
              key={entry.date}
              dayLabel={DAY_LABELS[idx]}
              date={weekDates[idx]}
              entry={entry}
              onChange={(field, value) => updateField(idx, field, value)}
              onBlur={() => persist(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DayCard({
  dayLabel, date, entry, onChange, onBlur,
}: {
  dayLabel: string;
  date: Date;
  entry: DayEntry;
  onChange: (field: 'done' | 'plan' | 'issues', value: string) => void;
  onBlur: () => void;
}) {
  const isToday = isoDate(date) === isoDate(new Date());
  return (
    <div className={`bg-surface border border-default rounded-lg overflow-hidden ${isToday ? 'ring-1 ring-accent' : ''}`}>
      <div className={`px-3 py-2 border-b border-default flex items-baseline gap-2 ${isToday ? 'bg-accent-soft' : 'bg-surface-2'}`}>
        <span className={`font-semibold ${isToday ? 'text-accent' : 'text-primary'}`}>{dayLabel}</span>
        <span className="text-xs text-muted">{fmtMD(date)}</span>
        {isToday && <span className="text-[10px] text-accent uppercase tracking-wider ml-auto">Today</span>}
      </div>
      <div className="p-3 space-y-3">
        {FIELDS.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            placeholder={f.placeholder}
            value={entry[f.key]}
            onChange={(v) => onChange(f.key, v)}
            onBlur={onBlur}
          />
        ))}
      </div>
    </div>
  );
}

function Field({
  label, placeholder, value, onChange, onBlur,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const empty = !value || !value.trim();
  return (
    <div>
      <label className="block text-[11px] text-muted mb-1 font-medium">{label}</label>
      {editing || empty ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setEditing(true)}
          onBlur={() => { setEditing(false); onBlur(); }}
          rows={4}
          placeholder={placeholder}
          className="w-full text-sm font-mono resize-none px-2 py-1.5"
          autoFocus={editing}
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="markdown-body min-h-[60px] cursor-text bg-surface-2 border border-default rounded-md px-2 py-1.5 hover:border-strong"
        >
          <ReactMarkdown>{value}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
