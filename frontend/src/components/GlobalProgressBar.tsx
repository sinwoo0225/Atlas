import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { subscribeProgress } from '../utils/progressEmitter';

type Phase = 'idle' | 'running' | 'completing';

// 글로벌 fetch progress bar — 화면 최상단 2px accent. 200ms threshold (progressEmitter).
// 점진 증가는 90% 까지만 (응답 대기 표시), 완료 신호 받으면 100% → fade-out.
export function GlobalProgressBar() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('idle');
  const [width, setWidth] = useState(0);
  const rafRef = useRef<number | null>(null);
  const completeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return subscribeProgress((active) => {
      // 완료 → fade-out 도중 새 fetch 가 시작하면 즉시 running 재진입.
      if (completeTimerRef.current != null) {
        clearTimeout(completeTimerRef.current);
        completeTimerRef.current = null;
      }
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      if (active) {
        setPhase('running');
        setWidth(0);
        const start = performance.now();
        const tick = (t: number) => {
          const elapsed = t - start;
          // 부드러운 가속 후 점근 — 600ms 시정수, 90% 수렴.
          const next = 90 * (1 - Math.exp(-elapsed / 600));
          setWidth(next);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setWidth(100);
        setPhase('completing');
        completeTimerRef.current = window.setTimeout(() => {
          setPhase('idle');
          setWidth(0);
          completeTimerRef.current = null;
        }, 300);
      }
    });
  }, []);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (completeTimerRef.current != null) clearTimeout(completeTimerRef.current);
  }, []);

  if (phase === 'idle') return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 h-0.5 z-[200] pointer-events-none"
      role="progressbar"
      aria-busy={phase === 'running'}
      aria-label={t('common:requestInProgress')}
    >
      <div
        className="h-full bg-accent"
        style={{
          width: `${width}%`,
          opacity: phase === 'completing' ? 0 : 1,
          transition: 'width 200ms ease-out, opacity 300ms ease-out',
        }}
      />
    </div>
  );
}
