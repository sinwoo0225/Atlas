import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { worklogApi } from '../api/worklog';
import { Button, Card, Spinner } from '../components/ui';
import { applyTextareaTab } from '../utils/textareaTab';
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
type FieldKey = 'done' | 'plan' | 'issues';

export function WorkLogPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);

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

  const weekEnd = addDays(weekStart, 4);
  const selectedEntry = entries[selectedIdx];
  const selectedDate = weekDates[selectedIdx];

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center gap-3 flex-wrap">
        <h1 className="h-page flex items-center gap-2">
          <CalendarDays size={18} className="text-muted" />
          업무 일지
        </h1>
        <div className="ml-4 flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={goPrev} title="이전 주" leadingIcon={<ChevronLeft size={16} />} />
          <Button variant="secondary" size="sm" onClick={goThis}>이번 주</Button>
          <Button variant="secondary" size="sm" onClick={goNext} title="다음 주" leadingIcon={<ChevronRight size={16} />} />
          <span className="ml-2 text-sm text-muted">
            {isoDate(weekStart)} (월) ~ {isoDate(weekEnd)} (금)
          </span>
        </div>
      </header>

      {loading ? (
        <Spinner label="로딩중…" />
      ) : (
        <>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-5">
            {entries.map((entry, idx) => (
              <PreviewCard
                key={entry.date}
                dayLabel={DAY_LABELS[idx]}
                date={weekDates[idx]}
                entry={entry}
                selected={idx === selectedIdx}
                onSelect={() => setSelectedIdx(idx)}
              />
            ))}
          </div>

          {selectedEntry && selectedDate && (
            <DayEditor
              dayLabel={DAY_LABELS[selectedIdx]}
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
  dayLabel, date, entry, selected, onSelect,
}: {
  dayLabel: string;
  date: Date;
  entry: DayEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const isToday = isoDate(date) === isoDate(new Date());
  const borderCls = selected
    ? 'border-accent ring-1 ring-accent'
    : 'border-default hover:border-strong';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left bg-surface border rounded-lg overflow-hidden transition-colors flex flex-col h-full ${borderCls}`}
    >
      <div className={`px-3 py-2 border-b border-default flex items-baseline gap-2 shrink-0 ${isToday ? 'bg-accent-soft' : 'bg-surface-2'}`}>
        <span className={`font-semibold ${isToday ? 'text-accent' : 'text-primary'}`}>{dayLabel}</span>
        <span className="text-xs text-muted">{fmtMD(date)}</span>
        {isToday && <span className="text-[10px] text-accent uppercase tracking-wider ml-auto">Today</span>}
      </div>
      <div className="p-2 space-y-1.5 flex-1">
        {FIELDS.map((f) => (
          <PreviewField key={f.key} label={f.label} value={entry[f.key]} />
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
  const isToday = isoDate(date) === isoDate(new Date());
  return (
    <Card padding="none" className="overflow-hidden">
      <div className={`px-4 py-2 border-b border-default flex items-baseline gap-2 ${isToday ? 'bg-accent-soft' : 'bg-surface-2'}`}>
        <span className={`font-semibold ${isToday ? 'text-accent' : 'text-primary'}`}>{dayLabel}</span>
        <span className="text-xs text-muted">{fmtMD(date)}</span>
        <span className="ml-2 text-xs text-muted">선택한 요일 편집</span>
        {isToday && <span className="text-[10px] text-accent uppercase tracking-wider ml-auto">Today</span>}
      </div>
      <div className="p-4 grid gap-4 grid-cols-1 md:grid-cols-3">
        {FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col">
            <label className="block text-xs text-muted mb-1 font-medium">{f.label}</label>
            <EditablePreviewField
              key={`${entry.date}-${f.key}`}
              value={entry[f.key]}
              placeholder={f.placeholder}
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
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => applyTextareaTab(e, onChange)}
        onBlur={() => {
          onBlur();
          setEditing(false);
        }}
        placeholder={placeholder}
        rows={12}
        className="w-full text-sm font-mono resize-y px-2 py-1.5"
      />
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
      title="클릭하여 편집"
    >
      {empty ? (
        <span className="text-sm text-muted italic whitespace-pre-wrap">{placeholder}</span>
      ) : (
        <div className="markdown-body text-sm">
          <ReactMarkdown>{value}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
