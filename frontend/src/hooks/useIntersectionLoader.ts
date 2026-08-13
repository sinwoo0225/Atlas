import { useEffect, useRef } from 'react';

// sentinel 이 viewport 에 들어오면 onIntersect 호출. enabled=false 면 비활성화.
// rootMargin 200px — 사용자가 끝에 도달하기 직전에 미리 트리거해 연속 로드가 자연스러움.
// busyRef — onIntersect 진행 중 중복 호출 가드 (intersect 가 여러 번 발생할 수 있음).
//
// rootRef — 리스트가 **자체 스크롤 컨테이너 안에** 있으면 그 요소를 넘긴다. 생략하면 viewport 기준이라
// 조상 overflow 에 클리핑되어 rootMargin 선행 트리거가 무력화된다(끝에 닿아야만 발화).
export function useIntersectionLoader(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  onIntersect: () => void,
  rootRef?: React.RefObject<HTMLElement | null>,
) {
  const busyRef = useRef(false);
  const cbRef = useRef(onIntersect);
  useEffect(() => { cbRef.current = onIntersect; }, [onIntersect]);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e?.isIntersecting) return;
        if (busyRef.current) return;
        busyRef.current = true;
        try {
          cbRef.current();
        } finally {
          // 짧은 쿨다운 — onIntersect 의 비동기 작업이 시작되기 전 다시 트리거되는 것 방어.
          // 작업 자체는 enabled=false (loading 중) 가드로 추가 보호.
          setTimeout(() => { busyRef.current = false; }, 200);
        }
      },
      { root: rootRef?.current ?? null, rootMargin: '200px', threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, enabled, rootRef]);
}
