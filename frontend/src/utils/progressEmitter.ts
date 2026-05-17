type Listener = (active: boolean) => void;

let pending = 0;
let timer: number | null = null;
let active = false;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l(active));
}

// 200ms 안에 끝나는 fetch 는 bar 안 보임 — 로컬 SQLite 빠른 응답 깜빡임 방지.
const THRESHOLD_MS = 200;

export function progressStart() {
  pending += 1;
  if (pending === 1 && !active && timer == null) {
    timer = window.setTimeout(() => {
      timer = null;
      if (pending > 0) {
        active = true;
        emit();
      }
    }, THRESHOLD_MS);
  }
}

export function progressEnd() {
  pending = Math.max(0, pending - 1);
  if (pending === 0) {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    if (active) {
      active = false;
      emit();
    }
  }
}

export function subscribeProgress(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
