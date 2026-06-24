import type { MyWorkItem } from '../types';

// 내 업무(MyWorkItem) 목록을 마감일 기준으로 섹션화하고, 기한 표기를 계산하는 순수 함수들.
// 컴포넌트(TodosPage)를 얇게 유지하기 위해 분리. 날짜는 모두 'YYYY-MM-DD' 로컬 문자열 비교.

export type TodoBucket = 'overdue' | 'today' | 'upcoming' | 'noDue';

// overdue → today → upcoming → noDue 순서 (렌더 순서이기도 함).
const BUCKET_ORDER: TodoBucket[] = ['overdue', 'today', 'upcoming', 'noDue'];

export function bucketOf(item: MyWorkItem, todayStr: string): TodoBucket {
  if (!item.dueDate) return 'noDue';
  const d = item.dueDate.slice(0, 10);
  if (d < todayStr) return 'overdue';
  if (d === todayStr) return 'today';
  return 'upcoming';
}

// 빈 버킷은 제외하고 BUCKET_ORDER 순서로 반환. 버킷 내 순서는 입력 순서 유지
// (백엔드가 이미 dueDate 오름차순 정렬).
export function groupMyWork(items: MyWorkItem[], todayStr: string): { key: TodoBucket; items: MyWorkItem[] }[] {
  const map: Record<TodoBucket, MyWorkItem[]> = { overdue: [], today: [], upcoming: [], noDue: [] };
  for (const it of items) map[bucketOf(it, todayStr)].push(it);
  return BUCKET_ORDER.filter((k) => map[k].length > 0).map((k) => ({ key: k, items: map[k] }));
}

export type DueTone = 'danger' | 'warning' | 'muted';

// 기한 pill 표기용. dueDate 없으면 null.
// days = 오늘 대비 일수(미래 +, 과거 -). overdue 는 |days| 일 지남.
export function dueDisplay(
  dueDate: string | null | undefined,
  todayStr: string,
): { kind: TodoBucket; days: number; tone: DueTone } | null {
  if (!dueDate) return null;
  const d = dueDate.slice(0, 10);
  // 둘 다 날짜만(YYYY-MM-DD)이라 Date.parse 가 UTC 자정으로 일관 → 정수 일수 차.
  const days = Math.round((Date.parse(d) - Date.parse(todayStr)) / 86_400_000);
  if (d < todayStr) return { kind: 'overdue', days, tone: 'danger' };
  if (d === todayStr) return { kind: 'today', days: 0, tone: 'warning' };
  return { kind: 'upcoming', days, tone: 'muted' };
}
