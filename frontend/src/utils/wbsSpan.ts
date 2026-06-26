import type { WbsItem } from '../types';

/** 노드와 모든 후손 중 startDate/endDate 가 있는 것들의 min/max (epoch ms). */
export function spanOf(item: WbsItem): { start?: number; end?: number } {
  let start: number | undefined;
  let end: number | undefined;
  const visit = (n: WbsItem) => {
    if (n.startDate) {
      const t = new Date(n.startDate).getTime();
      if (start === undefined || t < start) start = t;
    }
    if (n.endDate) {
      const t = new Date(n.endDate).getTime();
      if (end === undefined || t > end) end = t;
    }
    n.children?.forEach(visit);
  };
  visit(item);
  return { start, end };
}

/**
 * '착수 지연' — 계획 시작일이 지났는데도 아직 Planned(미착수)인 작업.
 * 목록 흐림 로직에서 사용: 이런 작업은 흐리게 두지 않고 진하게(+경고 톤) 표시해 착수를 환기.
 * 날짜만 비교(시각 무시). startDate 없으면 '지연' 판정 불가 → false.
 */
export function isOverdueToStart(item: { status: WbsItem['status']; startDate?: string }): boolean {
  if (item.status !== 'Planned' || !item.startDate) return false;
  const start = new Date(item.startDate);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return start.getTime() <= today.getTime();
}

/** epoch ms → YYYY-MM-DD (로컬 타임존). */
export function toIsoDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}
