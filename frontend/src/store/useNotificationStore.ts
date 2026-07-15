import { create } from 'zustand';

// 인앱 알림 이력(종 아이콘 패널). localStorage 영속 — 앱 재시작 후에도 유지.
// 메시지는 번역 문자열이 아니라 i18nKey + params 로 저장한다 → 언어 라이브 전환 시
// 과거 알림까지 렌더 시점에 재번역(요구사항: 다국어 적용). 토스트 노출은 엔진/스토어 밖에서.
const KEY = 'atlas:notifications';
const MAX = 100;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30일

export type NotificationSeverity = 'info' | 'warning' | 'danger' | 'success';

// 알림 클릭/버튼이 실행할 액션 서술자.
// ⚠ 알림은 localStorage 로 JSON 직렬화되므로 **클로저(onClick 함수)를 담을 수 없다** —
// 반드시 직렬화 가능한 서술자로 두고, 렌더 시점에 kind → 핸들러로 매핑한다(notifications/runAction).
// 향후 액션은 이 유니온에 추가한다. link(라우트 이동)로 표현되는 건 여기 넣지 않는다.
export type NotificationAction = { kind: 'releaseNotes'; version: string };

export interface AppNotification {
  id: string;
  // 어떤 알림 소스에서 왔는지 — 'deadline' | 'dailySummary' | 'update' | (향후 추가).
  sourceKey: string;
  severity: NotificationSeverity;
  // i18n 키(렌더 시 번역). 예: 'notifications:deadline.overdue.title'.
  i18nKey: string;
  i18nParams?: Record<string, unknown>;
  createdAt: number; // epoch ms
  read: boolean;
  // 클릭 시 이동할 라우트(있으면).
  link?: string;
  // 클릭 시 실행할 액션(라우트가 아닌 동작 — 예: 릴리즈 노트 모달). link 보다 우선.
  action?: NotificationAction;
}

// add() 입력 — id/createdAt/read 는 스토어가 채운다.
export interface NewNotification {
  sourceKey: string;
  severity: NotificationSeverity;
  i18nKey: string;
  i18nParams?: Record<string, unknown>;
  link?: string;
  action?: NotificationAction;
}

interface NotificationStore {
  notifications: AppNotification[];
  add: (n: NewNotification) => AppNotification;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
}

let counter = 0;
function genId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

// 최신 우선 정렬 + 30일 초과 prune + 최대 100개.
function prune(list: AppNotification[]): AppNotification[] {
  const cutoff = Date.now() - MAX_AGE_MS;
  return list
    .filter((n) => n.createdAt >= cutoff)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX);
}

function load(): AppNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? prune(parsed) : [];
  } catch {
    return [];
  }
}

function persist(list: AppNotification[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore (용량 초과 등)
  }
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: load(),
  add: (n) => {
    const rec: AppNotification = { id: genId(), createdAt: Date.now(), read: false, ...n };
    const next = prune([rec, ...get().notifications]);
    persist(next);
    set({ notifications: next });
    return rec;
  },
  markRead: (id) => {
    const next = get().notifications.map((x) => (x.id === id ? { ...x, read: true } : x));
    persist(next);
    set({ notifications: next });
  },
  markAllRead: () => {
    const next = get().notifications.map((x) => (x.read ? x : { ...x, read: true }));
    persist(next);
    set({ notifications: next });
  },
  remove: (id) => {
    const next = get().notifications.filter((x) => x.id !== id);
    persist(next);
    set({ notifications: next });
  },
  clear: () => {
    persist([]);
    set({ notifications: [] });
  },
}));

// 미확인 개수 — useNotificationStore(selectUnreadCount) 로 구독.
export const selectUnreadCount = (s: NotificationStore): number =>
  s.notifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0);
