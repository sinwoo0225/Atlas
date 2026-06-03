// Intl 기반 로캘 포매팅 — 현재 i18n.language 를 따라간다.
// 통화 '기호'(₩/원)는 각 페이지의 i18n 키(예: dashboard:budgetAmount)가 담당하고,
// 여기서는 숫자 그룹핑·날짜·상대시간만 로캘화한다. 컴포넌트는 useTranslation() 으로
// 언어 변경 시 재렌더되므로, render 중 이 함수를 호출하면 최신 언어가 반영된다.
import i18n from './index';

function locale(): string {
  return i18n.language === 'en' ? 'en-US' : 'ko-KR';
}

function asDate(v: string | number | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

/** 천 단위 구분 등 로캘 숫자 포맷. */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat(locale()).format(n);
}

/** 연·월·일 (예: 2026. 6. 3. / Jun 3, 2026). */
export function formatDate(v: string | number | Date): string {
  return new Intl.DateTimeFormat(locale(), { year: 'numeric', month: 'short', day: 'numeric' }).format(asDate(v));
}

/** 날짜+시각 (예: 2026. 6. 3. 오후 2:30 / Jun 3, 2026, 2:30 PM). */
export function formatDateTime(v: string | number | Date): string {
  return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(asDate(v));
}

/** 연·월 헤더 (예: 2026년 6월 / June 2026). */
export function formatMonthYear(v: Date): string {
  return new Intl.DateTimeFormat(locale(), { year: 'numeric', month: 'long' }).format(v);
}

/** 상대 시간 — 방금 / N분 전 / N시간 전 / 어제 / N일 전, 7일 이상은 ISO 날짜. */
export function relativeTime(iso: string): string {
  const ms = new Date(iso).getTime();
  const diffSec = Math.floor((Date.now() - ms) / 1000);
  if (diffSec < 60) return i18n.t('common:relative.justNow');
  const m = Math.floor(diffSec / 60);
  if (m < 60) return i18n.t('common:relative.minutesAgo', { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return i18n.t('common:relative.hoursAgo', { count: h });
  const d = Math.floor(h / 24);
  if (d === 1) return i18n.t('common:relative.yesterday');
  if (d < 7) return i18n.t('common:relative.daysAgo', { count: d });
  return iso.slice(0, 10);
}
