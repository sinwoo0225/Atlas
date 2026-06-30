// 메뉴 즐겨찾기 (F8) — 사이드바 상단에 고정하는 메뉴/탭 바로가기. localStorage 만 사용(백엔드 무관).
// recentItems.ts 패턴: dedupe by href, change 이벤트 dispatch. 전역 메뉴·프로젝트 메뉴·통합 모니터링 탭 모두 지원.

export interface FavoriteMenu {
  href: string;          // 고유 키 + 이동 대상 (쿼리 포함). 예: '/monitoring?tab=tasks&view=kanban', '/projects/12/wbs'
  iconSlot: string;      // MenuIcon 슬롯 ('/monitoring' | 'wbs' | ...) — 아이콘 표시용
  labelKey?: string;     // nav:* 등 i18n 키 (전역/프로젝트 기본 메뉴). 언어 전환에 반응.
  label?: string;        // 리터럴 라벨 (탭 즐겨찾기 등 동적 합성 라벨). labelKey 가 있으면 그쪽 우선.
  projectName?: string;  // 프로젝트 메뉴면 라벨 앞에 'ProjectName › ' 접두.
}

const KEY = 'atlas:menuFavorites';
const EVENT = 'atlas:favorites-updated';
const MAX = 30;

export function listFavorites(): FavoriteMenu[] {
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

export function isFavorite(href: string): boolean {
  return listFavorites().some((f) => f.href === href);
}

function save(items: FavoriteMenu[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    // localStorage 못 쓰면 무시
  }
}

// 있으면 제거, 없으면 추가(끝에). href 기준 고유.
export function toggleFavorite(item: FavoriteMenu): void {
  const cur = listFavorites();
  const exists = cur.some((f) => f.href === item.href);
  save(exists ? cur.filter((f) => f.href !== item.href) : [...cur, item]);
}

export function removeFavorite(href: string): void {
  save(listFavorites().filter((f) => f.href !== href));
}

export const FAVORITES_EVENT = EVENT;

// 현재 위치가 즐겨찾기 대상과 일치하는지(활성 표시용).
// 쿼리 없는 href: pathname 정확 일치. 쿼리 있는 href: pathname 일치 + 즐겨찾기의 모든 쿼리 param 이 현재와 동일.
export function matchesFavorite(href: string, pathname: string, search: string): boolean {
  const qi = href.indexOf('?');
  if (qi < 0) return pathname === href;
  const favPath = href.slice(0, qi);
  if (pathname !== favPath) return false;
  const favParams = new URLSearchParams(href.slice(qi + 1));
  const curParams = new URLSearchParams(search);
  for (const [k, v] of favParams) if (curParams.get(k) !== v) return false;
  return true;
}
