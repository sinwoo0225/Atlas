import { describe, expect, it } from 'vitest';
import {
  PRIORITY_SORT_RANK,
  STATUS_SORT_RANK,
  compareDefault,
  customSortKey,
  isSortableKey,
  makeIssueComparator,
  nextSort,
  type IssueComparatorOptions,
  type IssueSortKey,
} from './issueSort';
import type { Issue, IssueCustomColumn } from '../types';

const COLUMNS: IssueCustomColumn[] = [
  { key: 'c1', name: '견적', type: 'number', order: 0 },
  { key: 'c2', name: '비고', type: 'text', order: 1 },
  { key: 'c3', name: '검토일', type: 'date', order: 2 },
];

const OPTS: IssueComparatorOptions = {
  columns: COLUMNS,
  resourceNameById: new Map([[1, '김하나'], [2, '박두리'], [3, 'Alice']]),
};

let seq = 0;
function issue(patch: Partial<Issue> = {}): Issue {
  seq += 1;
  return {
    id: seq,
    projectId: 1,
    title: `이슈 ${seq}`,
    description: '',
    status: 'Open',
    priority: 'Medium',
    createdAt: '2026-01-01T00:00:00',
    updatedAt: '2026-01-01T00:00:00',
    ...patch,
  };
}

/** 정렬 후 식별용 라벨 배열. */
const order = (items: Issue[], key: IssueSortKey, dir: 'asc' | 'desc', opts = OPTS) =>
  [...items].sort(makeIssueComparator({ key, dir }, opts)).map((i) => i.title);

describe('빈 값 처리', () => {
  it('방향과 무관하게 항상 뒤로 간다', () => {
    const items = [
      issue({ title: '없음' }),
      issue({ title: '이름', dueDate: '2026-03-01' }),
      issue({ title: '늦음', dueDate: '2026-09-01' }),
    ];
    expect(order(items, 'dueDate', 'asc')).toEqual(['이름', '늦음', '없음']);
    expect(order(items, 'dueDate', 'desc')).toEqual(['늦음', '이름', '없음']);
  });

  it('공백만 있는 문자열도 빈 값으로 본다', () => {
    const items = [issue({ title: 'A', category: '   ' }), issue({ title: 'B', category: '버그' })];
    expect(order(items, 'category', 'asc')).toEqual(['B', 'A']);
  });

  it('숫자 열에 비숫자 값이 들어가면 빈 값으로 본다', () => {
    const items = [
      issue({ title: '문자', customFields: { c1: 'N/A' } }),
      issue({ title: '숫자', customFields: { c1: '5' } }),
    ];
    expect(order(items, customSortKey('c1'), 'asc')).toEqual(['숫자', '문자']);
    expect(order(items, customSortKey('c1'), 'desc')).toEqual(['숫자', '문자']);
  });
});

describe('랭크 정렬', () => {
  it('우선순위는 High → Medium → Low (백엔드 enum 순서와 반대)', () => {
    expect(PRIORITY_SORT_RANK.High).toBeLessThan(PRIORITY_SORT_RANK.Medium);
    expect(PRIORITY_SORT_RANK.Medium).toBeLessThan(PRIORITY_SORT_RANK.Low);
    const items = [
      issue({ title: '낮음', priority: 'Low' }),
      issue({ title: '높음', priority: 'High' }),
      issue({ title: '보통', priority: 'Medium' }),
    ];
    expect(order(items, 'priority', 'asc')).toEqual(['높음', '보통', '낮음']);
    expect(order(items, 'priority', 'desc')).toEqual(['낮음', '보통', '높음']);
  });

  it('상태는 진행 → 열림 → 해결됨 → 닫힘', () => {
    expect(STATUS_SORT_RANK).toEqual({ InProgress: 0, Open: 1, Resolved: 2, Closed: 3 });
    const items = [
      issue({ title: '닫힘', status: 'Closed' }),
      issue({ title: '진행', status: 'InProgress' }),
      issue({ title: '해결', status: 'Resolved' }),
      issue({ title: '열림', status: 'Open' }),
    ];
    expect(order(items, 'status', 'asc')).toEqual(['진행', '열림', '해결', '닫힘']);
  });
});

describe('커스텀 열', () => {
  it('number 는 수치로 비교한다 (사전순이면 10 이 2 보다 앞선다)', () => {
    const items = [
      issue({ title: '십', customFields: { c1: '10' } }),
      issue({ title: '이', customFields: { c1: '2' } }),
    ];
    expect(order(items, customSortKey('c1'), 'asc')).toEqual(['이', '십']);
  });

  it('date 는 ISO 문자열로 비교한다', () => {
    const items = [
      issue({ title: '나중', customFields: { c3: '2026-12-01' } }),
      issue({ title: '먼저', customFields: { c3: '2026-02-28' } }),
    ];
    expect(order(items, customSortKey('c3'), 'asc')).toEqual(['먼저', '나중']);
  });

  it('text 는 자연 정렬한다 (항목2 < 항목10)', () => {
    const items = [
      issue({ title: '십', customFields: { c2: '항목10' } }),
      issue({ title: '이', customFields: { c2: '항목2' } }),
    ];
    expect(order(items, customSortKey('c2'), 'asc')).toEqual(['이', '십']);
  });

  it('삭제된 열을 가리키면 기본 순서로 폴백한다', () => {
    const items = [
      issue({ title: '닫힘', status: 'Closed' }),
      issue({ title: '진행', status: 'InProgress' }),
    ];
    expect(order(items, customSortKey('gone'), 'asc')).toEqual(['진행', '닫힘']);
    expect(isSortableKey('custom:gone', COLUMNS)).toBe(false);
    expect(isSortableKey('custom:c1', COLUMNS)).toBe(true);
    expect(isSortableKey('title', COLUMNS)).toBe(true);
    expect(isSortableKey('nope', COLUMNS)).toBe(false);
  });
});

describe('담당자', () => {
  it('assigneeName 이 아니라 리소스 마스터 이름으로 비교한다', () => {
    const items = [
      // 낙관적 갱신 직후를 재현 — assigneeName 이 stale.
      issue({ title: '박', assigneeResourceId: 2, assigneeName: '김하나' }),
      issue({ title: '김', assigneeResourceId: 1, assigneeName: '박두리' }),
      issue({ title: '없음', assigneeResourceId: null }),
    ];
    expect(order(items, 'assignee', 'asc')).toEqual(['김', '박', '없음']);
  });
});

describe('즐겨찾기 고정', () => {
  it('어떤 키·방향에서도 최상단을 유지한다', () => {
    const items = [
      issue({ title: 'A' }),
      issue({ title: 'Z', isFavorite: true }),
      issue({ title: 'B' }),
    ];
    expect(order(items, 'title', 'asc')).toEqual(['Z', 'A', 'B']);
    expect(order(items, 'title', 'desc')).toEqual(['Z', 'B', 'A']);
  });

  it('favoritesFirst:false 면 고정하지 않는다', () => {
    const items = [issue({ title: 'A' }), issue({ title: 'Z', isFavorite: true })];
    expect(order(items, 'title', 'desc', { ...OPTS, favoritesFirst: false })).toEqual(['Z', 'A']);
  });
});

describe('기본 순서 / 사이클', () => {
  it('sort 가 null 이면 compareDefault (즐겨찾기 → 상태순)', () => {
    const comparator = makeIssueComparator(null, OPTS);
    expect(comparator).toBe(compareDefault);
    const items = [
      issue({ title: '열림', status: 'Open' }),
      issue({ title: '닫힘즐찾', status: 'Closed', isFavorite: true }),
      issue({ title: '진행', status: 'InProgress' }),
    ];
    expect([...items].sort(comparator).map((i) => i.title)).toEqual(['닫힘즐찾', '진행', '열림']);
  });

  it('동률이면 입력 순서를 보존한다 (안정 정렬)', () => {
    const items = [
      issue({ title: '먼저', priority: 'High' }),
      issue({ title: '나중', priority: 'High' }),
    ];
    expect(order(items, 'priority', 'asc')).toEqual(['먼저', '나중']);
    expect(order(items, 'priority', 'desc')).toEqual(['먼저', '나중']);
  });

  it('nextSort 는 기본 → 오름 → 내림 → 기본을 순환한다', () => {
    const asc = nextSort(null, 'title');
    expect(asc).toEqual({ key: 'title', dir: 'asc' });
    const desc = nextSort(asc, 'title');
    expect(desc).toEqual({ key: 'title', dir: 'desc' });
    expect(nextSort(desc, 'title')).toBeNull();
  });

  it('다른 열을 누르면 그 열 오름차순으로 시작한다', () => {
    expect(nextSort({ key: 'title', dir: 'desc' }, 'status')).toEqual({ key: 'status', dir: 'asc' });
  });
});
