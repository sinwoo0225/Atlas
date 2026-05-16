// E-2 "최근 본 항목" 위젯 — localStorage 만 사용 (백엔드 무관).
// dedupe by path, 최신 head, cap 10.

export interface RecentItem {
  path: string;          // '/projects/12/wbs'
  projectId: number;
  projectName: string;
  section: string;       // 'dashboard'|'wbs'|'worklog'|'issues'|'changelogs'|'meetings'|'devinfo'|'map'
  visitedAt: string;     // ISO
}

const KEY = 'pm-hub-recent';
const MAX = 10;

export function getRecent(): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushRecent(item: Omit<RecentItem, 'visitedAt'>): void {
  try {
    const prev = getRecent().filter((r) => r.path !== item.path);
    const next: RecentItem[] = [{ ...item, visitedAt: new Date().toISOString() }, ...prev].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('atlas:recent-updated'));
  } catch {
    // localStorage 못 쓰면 무시
  }
}
