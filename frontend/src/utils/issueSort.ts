import type { Issue, IssueCustomColumn, IssuePriority, IssueStatus } from '../types';

// 이슈 목록 정렬 단일 진실 소스 (wbsSort.ts 와 같은 역할).
// React 의존 0 — IssuesPage 는 makeIssueComparator/nextSort 만 호출한다.

/** 정렬 가능한 고정 열. 표시 순서와 무관한 안정 식별자(Issue 필드명에 맞춤). */
export type IssueSortField =
  | 'category' | 'title' | 'status' | 'priority' | 'assignee'
  | 'occurredOn' | 'dueDate' | 'resolvedDate';

/** 커스텀 열은 표시명이 아니라 안정 slug(c1,c2…)로 보관 → 열 이름을 바꿔도 정렬이 유지된다. */
export type IssueSortKey = IssueSortField | `custom:${string}`;
export type SortDirection = 'asc' | 'desc';

/** null = 정렬 미지정(= compareDefault). */
export interface IssueSort {
  key: IssueSortKey;
  dir: SortDirection;
}

export const CUSTOM_SORT_PREFIX = 'custom:';

export function customSortKey(colKey: string): IssueSortKey {
  return `${CUSTOM_SORT_PREFIX}${colKey}`;
}

/** `custom:<key>` → `<key>`. 고정 열이면 null. */
export function customColumnKeyOf(key: IssueSortKey): string | null {
  return key.startsWith(CUSTOM_SORT_PREFIX) ? key.slice(CUSTOM_SORT_PREFIX.length) : null;
}

const SORT_FIELDS: readonly IssueSortField[] = [
  'category', 'title', 'status', 'priority', 'assignee', 'occurredOn', 'dueDate', 'resolvedDate',
];

/** 저장된 정렬 키가 아직 유효한지 — 삭제된 커스텀 열 방어. */
export function isSortableKey(key: string, columns: IssueCustomColumn[]): key is IssueSortKey {
  const colKey = key.startsWith(CUSTOM_SORT_PREFIX) ? key.slice(CUSTOM_SORT_PREFIX.length) : null;
  if (colKey !== null) return columns.some((c) => c.key === colKey);
  return (SORT_FIELDS as readonly string[]).includes(key);
}

/** 기본 목록 순서의 상태 랭크: 진행 → 열림 → 해결됨 → 닫힘. */
export const STATUS_SORT_RANK: Record<IssueStatus, number> = {
  InProgress: 0, Open: 1, Resolved: 2, Closed: 3,
};

/**
 * 우선순위 랭크 — 화면 표시 순서(High → Medium → Low) 기준.
 * 백엔드 enum 선언 순서(Low, Medium, High)와 반대이므로 ordinal 을 그대로 쓰면 안 된다.
 */
export const PRIORITY_SORT_RANK: Record<IssuePriority, number> = {
  High: 0, Medium: 1, Low: 2,
};

export interface IssueComparatorOptions {
  /** custom:<key> 의 type(text/date/number) 해석용. */
  columns: IssueCustomColumn[];
  /**
   * 담당자 이름 해석용. issue.assigneeName 을 쓰지 않는 이유 —
   * updateField 의 낙관적 갱신이 assigneeResourceId 만 바꾸고 assigneeName 은 stale 로 남긴다.
   */
  resourceNameById: Map<number, string>;
  /** 즐겨찾기 최상단 고정 (기본 true). */
  favoritesFirst?: boolean;
}

const emptyToNull = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim();
  return s ? s : null;
};

/** 날짜는 full datetime 이 올 수도 있어 yyyy-MM-dd 로 정규화 후 ISO 문자열 비교한다. */
const dateValue = (v: string | null | undefined): string | null => {
  const s = emptyToNull(v);
  return s ? s.slice(0, 10) : null;
};

/** 열별 비교값 추출. null = 값 없음(항상 뒤로 간다). */
export function issueSortValue(
  issue: Issue,
  key: IssueSortKey,
  opts: IssueComparatorOptions,
): string | number | null {
  const colKey = customColumnKeyOf(key);
  if (colKey !== null) {
    const col = opts.columns.find((c) => c.key === colKey);
    if (!col) return null;
    const raw = emptyToNull(issue.customFields?.[colKey]);
    if (raw === null) return null;
    if (col.type === 'number') {
      const n = Number(raw);
      return Number.isNaN(n) ? null : n;
    }
    if (col.type === 'date') return dateValue(raw);
    return raw;
  }

  switch (key) {
    case 'category': return emptyToNull(issue.category);
    case 'title': return emptyToNull(issue.title);
    case 'status': return STATUS_SORT_RANK[issue.status];
    case 'priority': return PRIORITY_SORT_RANK[issue.priority];
    case 'assignee':
      return issue.assigneeResourceId != null
        ? emptyToNull(opts.resourceNameById.get(issue.assigneeResourceId))
        : null;
    case 'occurredOn': return dateValue(issue.occurredOn);
    case 'dueDate': return dateValue(issue.dueDate);
    case 'resolvedDate': return dateValue(issue.resolvedDate);
    default: return null;
  }
}

const compareValues = (a: string | number, b: string | number): number => {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  // numeric: "이슈2" < "이슈10" 자연 정렬. sensitivity base: 대소문자·악센트 무시.
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};

const favoriteRank = (i: Issue) => (i.isFavorite ? 0 : 1);

/**
 * 정렬 미지정 시의 순서 — 즐겨찾기 우선 → 상태순(진행→열림→해결됨→닫힘).
 * 동률은 tiebreak 없이 안정 정렬에 맡긴다(= API 의 UpdatedAt 내림차순이 그대로 남는다).
 */
export function compareDefault(a: Issue, b: Issue): number {
  return favoriteRank(a) - favoriteRank(b)
    || STATUS_SORT_RANK[a.status] - STATUS_SORT_RANK[b.status];
}

/**
 * 사용자 지정 정렬 비교기. sort 가 null 이거나 키가 무효(삭제된 커스텀 열)면 compareDefault.
 * 빈 값은 방향과 무관하게 항상 뒤 — desc 로 뒤집었을 때 빈 칸이 위로 몰리는 건 쓸모없다.
 */
export function makeIssueComparator(
  sort: IssueSort | null,
  opts: IssueComparatorOptions,
): (a: Issue, b: Issue) => number {
  if (!sort || !isSortableKey(sort.key, opts.columns)) return compareDefault;
  const { key, dir } = sort;
  const favoritesFirst = opts.favoritesFirst !== false;

  return (a, b) => {
    if (favoritesFirst) {
      const fav = favoriteRank(a) - favoriteRank(b);
      if (fav !== 0) return fav;
    }
    const av = issueSortValue(a, key, opts);
    const bv = issueSortValue(b, key, opts);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const base = compareValues(av, bv);
    return dir === 'desc' ? -base : base;
  };
}

/** 헤더 클릭 사이클: 기본 → 오름 → 내림 → 기본. 다른 열을 누르면 그 열 오름차순으로 시작. */
export function nextSort(current: IssueSort | null, key: IssueSortKey): IssueSort | null {
  if (!current || current.key !== key) return { key, dir: 'asc' };
  if (current.dir === 'asc') return { key, dir: 'desc' };
  return null;
}
