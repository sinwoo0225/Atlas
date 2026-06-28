import { todosApi } from '../../api/todos';
import type { NotificationSource } from '../types';

function parseHHMM(s: string): { h: number; m: number } {
  const [hh, mm] = (s || '09:00').split(':');
  const h = Math.min(23, Math.max(0, parseInt(hh, 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(mm, 10) || 0));
  return { h, m };
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// 일일 업무 정리 — 매일 지정 시각 이후 1회(dedupKey=날짜). 요약 수치(오늘 마감/지연/진행) 포함.
export const dailySummarySource: NotificationSource = {
  key: 'dailySummary',
  isEnabled: (n) => n.dailySummary.enabled,
  async collect({ settings, myResourceId, now }) {
    const ds = settings.dailySummary;
    if (!ds.enabled) return [];
    const { h, m } = parseHHMM(ds.time);
    const scheduled = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    if (now.getTime() < scheduled.getTime()) return []; // 아직 지정 시각 전

    // 요약 수치 — 내 업무 기준. 실패해도 0 으로 안내는 띄운다.
    let dueToday = 0;
    let overdue = 0;
    let inProgress = 0;
    try {
      const res = await todosApi.myWork(myResourceId ?? undefined);
      const today = startOfDay(now);
      for (const it of res.items) {
        if ((it.status || '').toLowerCase().includes('progress')) inProgress += 1;
        if (it.dueDate) {
          const due = startOfDay(new Date(it.dueDate));
          if (due < today) overdue += 1;
          else if (due === today) dueToday += 1;
        }
      }
    } catch {
      // 무시 — 0 으로 안내.
    }

    return [
      {
        sourceKey: 'dailySummary',
        severity: 'info',
        i18nKey: 'notifications:dailySummary',
        i18nParams: { dueToday, overdue, inProgress },
        link: '/todos',
        // 날짜 + 설정 시각 — 같은 날에도 시각을 바꾸면 새 키라 다시 울린다(테스트/재알림 용이).
        dedupKey: `dailySummary:${isoDate(now)}:${ds.time}`,
      },
    ];
  },
};
