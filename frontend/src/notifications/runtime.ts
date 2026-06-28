// 알림 런타임 상태 — 이미 알린 dedup 키 집합. 설정(AppSettings)과 분리된 별도 localStorage
// 키에 보관한다 → 설정 내보내기/가져오기/초기화에 오염되지 않음.
const KEY = 'atlas:notify-runtime';
const MAX_KEYS = 500;
const KEY_TTL_MS = 45 * 24 * 60 * 60 * 1000; // 45일

interface NotifiedEntry {
  key: string;
  at: number;
}
interface RuntimeState {
  notified: NotifiedEntry[];
}

function load(): RuntimeState {
  if (typeof window === 'undefined') return { notified: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { notified: [] };
    const parsed = JSON.parse(raw);
    return { notified: Array.isArray(parsed?.notified) ? parsed.notified : [] };
  } catch {
    return { notified: [] };
  }
}

function save(s: RuntimeState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

// 틱 시작 시 1회 로드해 집합으로 사용.
export function loadNotifiedKeys(): Set<string> {
  return new Set(load().notified.map((e) => e.key));
}

// 디스패치한 키들을 기록 + TTL/개수 prune. 완료된 항목의 키는 자연히 재생성되지 않으므로
// 시간이 지나면 TTL 로 사라진다(단독 사용자 규모에서 안전).
export function markNotified(keys: string[]): void {
  if (keys.length === 0) return;
  const now = Date.now();
  const s = load();
  const existing = new Set(s.notified.map((e) => e.key));
  for (const k of keys) {
    if (!existing.has(k)) s.notified.push({ key: k, at: now });
  }
  const cutoff = now - KEY_TTL_MS;
  s.notified = s.notified.filter((e) => e.at >= cutoff).slice(-MAX_KEYS);
  save(s);
}
