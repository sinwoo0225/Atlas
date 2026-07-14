// 마감 단계 판정 — 알림(deadlineSource)과 위젯이 **같은 기준**을 쓰도록 한 곳에 모은다.
// 이원화되면 "알림은 왔는데 위젯엔 임박으로 안 보인다" 같은 어긋남이 난다.
// 임박 지평(withinDays)은 설정의 notifications.deadline.withinDays 하나를 공유한다.

export type DueStage = 'overdue' | 'today' | 'soon' | 'later';

export function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// 오늘 기준 마감까지 남은 일수. 음수면 지났음. 마감일이 없으면 null.
export function daysUntilDue(dueDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!dueDate) return null;
  return Math.round((startOfDay(new Date(dueDate)) - startOfDay(now)) / 86_400_000);
}

// 마감 없는 항목은 'later' — 임박도 지연도 아니다(마감이 없으니 넘길 마감도 없다).
export function dueStageOf(
  dueDate: string | null | undefined,
  withinDays: number,
  now: Date = new Date(),
): DueStage {
  const days = daysUntilDue(dueDate, now);
  if (days === null) return 'later';
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  return days <= withinDays ? 'soon' : 'later';
}

// '임박·지연' 구획으로 끌어올릴 대상인가.
export function isUrgentStage(stage: DueStage): boolean {
  return stage !== 'later';
}

// D-3 (사흘 남음) / D-0 (오늘) / D+2 (이틀 지남)
export function ddayLabel(days: number): string {
  return days === 0 ? 'D-0' : days > 0 ? `D-${days}` : `D+${-days}`;
}
