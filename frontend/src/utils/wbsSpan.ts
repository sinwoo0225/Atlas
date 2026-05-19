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

/** epoch ms → YYYY-MM-DD (로컬 타임존). */
export function toIsoDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}
