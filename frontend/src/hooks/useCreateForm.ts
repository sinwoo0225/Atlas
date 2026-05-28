import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGlobalShortcut } from './useGlobalShortcut';

// 목록 페이지의 '신규 항목' 생성 폼을 여는 표준 트리거. 두 경로를 한 곳에서 처리:
//   - Ctrl+N (현재 페이지 컨텍스트)
//   - URL ?new=1 (명령 팔레트 '신규 …' 명령이 해당 페이지로 이동하며 부여)
// ?new 는 소비 즉시 제거 — 새로고침·뒤로가기로 폼이 다시 열리는 것을 방지.
export function useCreateForm(open: () => void) {
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; });

  useGlobalShortcut('mod+n', () => openRef.current());

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    openRef.current();
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
}
