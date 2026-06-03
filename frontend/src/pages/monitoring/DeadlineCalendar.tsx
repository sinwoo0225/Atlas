import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { monitoringApi } from '../../api/monitoring';
import { Card, Spinner } from '../../components/ui';
import { formatMonthYear } from '../../i18n/format';
import type { CalendarEvent } from '../../types';

// MonitoringPage 와 동일한 월요일 시작 기준 date 유틸 (로컬).
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function startOfWeekSun(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - r.getDay()); // 일=0 → 일요일이 주 시작
  return r;
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MAX_CHIPS = 3;

function isCompleted(e: CalendarEvent): boolean {
  return e.kind === 'wbs'
    ? e.status === 'Done'
    : e.status === 'Resolved' || e.status === 'Closed';
}

export function DeadlineCalendar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // 보이는 달의 1일.
  const [anchor, setAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // 달을 감싸는 주(월~일) 범위.
  const gridStart = useMemo(() => startOfWeekSun(anchor), [anchor]);
  const gridEnd = useMemo(() => {
    const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const ws = startOfWeekSun(lastOfMonth);
    return addDays(ws, 6);
  }, [anchor]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    monitoringApi
      .getCalendar(isoDate(gridStart), isoDate(gridEnd))
      .then((evs) => { if (active) setEvents(evs); })
      .catch(() => { if (active) setEvents([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [gridStart, gridEnd]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = e.date.slice(0, 10);
      const arr = map.get(key);
      if (arr) arr.push(e);
      else map.set(key, [e]);
    }
    // 같은 칸 안: 마일스톤 → WBS → 이슈, 그 안에서 제목 순.
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.isMilestone !== b.isMilestone) return a.isMilestone ? -1 : 1;
        if (a.kind !== b.kind) return a.kind === 'wbs' ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
    }
    return map;
  }, [events]);

  const days = useMemo(() => {
    const out: Date[] = [];
    let d = gridStart;
    while (d <= gridEnd) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [gridStart, gridEnd]);

  const todayIso = isoDate(new Date());
  const monthIdx = anchor.getMonth();

  const goPrev = () => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1));
  const goNext = () => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1));
  const goToday = () => {
    const now = new Date();
    setAnchor(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const eventPath = (e: CalendarEvent) =>
    e.kind === 'wbs'
      ? `/projects/${e.projectId}/wbs?highlight=${e.id}`
      : `/projects/${e.projectId}/issues?highlight=${e.id}`;

  return (
    <Card padding="normal">
      {/* 헤더: 월 이동 + 오늘로 + 범례 */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            aria-label={t('monitoring:calendar.prevMonth')}
            className="p-1.5 rounded text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-primary min-w-[6rem] text-center">
            {formatMonthYear(new Date(anchor.getFullYear(), monthIdx, 1))}
          </span>
          <button
            type="button"
            onClick={goNext}
            aria-label={t('monitoring:calendar.nextMonth')}
            className="p-1.5 rounded text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="ml-1 px-2 py-1 text-xs rounded border border-default text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
          >
            {t('monitoring:calendar.today')}
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1"><Dot className="bg-accent" />WBS</span>
          <span className="flex items-center gap-1"><Dot className="bg-warning" />{t('monitoring:calendar.legendIssue')}</span>
          <span className="flex items-center gap-1"><Star size={11} className="text-on-warning" />{t('monitoring:calendar.legendMilestone')}</span>
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 gap-px text-center text-xs text-muted mb-px">
        {WEEKDAY_KEYS.map((w, i) => (
          <div key={w} className={`py-1 ${i === 0 ? 'text-on-danger' : i === 6 ? 'text-accent' : ''}`}>{t(`monitoring:calendar.weekday.${w}`)}</div>
        ))}
      </div>

      {loading ? (
        <Spinner label={t('common:loading')} />
      ) : (
        <div className="grid grid-cols-7 gap-px bg-default rounded overflow-hidden border border-default">
          {days.map((d) => {
            const key = isoDate(d);
            const inMonth = d.getMonth() === monthIdx;
            const isToday = key === todayIso;
            const dayEvents = byDay.get(key) ?? [];
            return (
              <div
                key={key}
                className={`min-h-[92px] p-1 flex flex-col gap-0.5 ${inMonth ? 'bg-surface' : 'bg-surface-2'}`}
              >
                <div className="flex justify-end">
                  <span
                    className={`text-xs leading-none px-1 py-0.5 rounded ${
                      isToday ? 'bg-accent text-on-accent font-semibold' : inMonth ? 'text-secondary' : 'text-muted'
                    }`}
                  >
                    {d.getDate()}
                  </span>
                </div>
                {dayEvents.slice(0, MAX_CHIPS).map((e) => (
                  <EventChip key={`${e.kind}-${e.id}`} ev={e} overdue={key < todayIso && !isCompleted(e)} onClick={() => navigate(eventPath(e))} />
                ))}
                {dayEvents.length > MAX_CHIPS && (
                  <span className="text-[10px] text-muted px-1">{t('monitoring:calendar.moreChips', { count: dayEvents.length - MAX_CHIPS })}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && events.length === 0 && (
        <p className="text-xs text-muted text-center mt-3">{t('monitoring:calendar.empty')}</p>
      )}
    </Card>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${className}`} />;
}

function EventChip({ ev, overdue, onClick }: { ev: CalendarEvent; overdue: boolean; onClick: () => void }) {
  const completed = isCompleted(ev);
  const dotCls = ev.kind === 'wbs' ? 'bg-accent' : 'bg-warning';
  return (
    <button
      type="button"
      onClick={onClick}
      title={`[${ev.projectName}] ${ev.title}`}
      className={`w-full flex items-center gap-1 px-1 py-0.5 rounded text-left text-[11px] leading-tight hover:bg-surface-2 transition-colors ${
        completed ? 'opacity-50 line-through' : ''
      }`}
    >
      {ev.isMilestone ? (
        <Star size={10} className="shrink-0 text-on-warning" />
      ) : (
        <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${dotCls}`} />
      )}
      <span className={`truncate ${overdue ? 'text-on-danger font-medium' : 'text-secondary'}`}>{ev.title}</span>
    </button>
  );
}
