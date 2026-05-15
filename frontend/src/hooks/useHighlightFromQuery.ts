import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

// 페이지가 mount 되거나 데이터가 도착하면 ?highlight=:id 쿼리를 읽어
// data-highlight-id="..." 가 일치하는 DOM 요소에 임시 outline 강조 + scrollIntoView 한다.
// 한 번 처리한 후엔 URL 에서 쿼리 파라미터를 제거 — 새로고침 시 깜빡임 방지.
//
// 페이지가 데이터 로딩 후에 행을 그리는 경우, deps 배열에 로딩 완료 신호를 넘긴다 (예: items.length).
export function useHighlightFromQuery(deps: ReadonlyArray<unknown> = []) {
  const [searchParams, setSearchParams] = useSearchParams();
  const target = searchParams.get('highlight');

  useEffect(() => {
    if (!target) return;
    // 다음 microtask 에 DOM 조회 — 같은 commit 사이클에서 mount 직후 querySelector 가 못 잡는 경우 회피.
    const id = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-highlight-id="${cssEscape(target)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('search-highlight');
        window.setTimeout(() => el.classList.remove('search-highlight'), 1600);
      }
      // URL 정리 — 새로고침 시 다시 강조되지 않도록.
      const next = new URLSearchParams(searchParams);
      next.delete('highlight');
      setSearchParams(next, { replace: true });
    }, 50);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ...deps]);
}

function cssEscape(s: string): string {
  // 간단 이스케이프 — id 는 숫자 문자열이라 사실 필요 없지만 안전 차원에서.
  return s.replace(/["\\]/g, (m) => '\\' + m);
}
