// 커스텀 색 테마 — 사용자가 입력한 핵심 12색(BaseColors)으로 index.css 의 전체
// 토큰(35개)을 파생해 documentElement 에 인라인 주입한다. 로고 2색(--logo-*)은
// 브랜드 설정에서 별도 적용하므로 여기 파생에는 포함하지 않는다.

export interface BaseColors {
  bgBase: string;
  bgSidebar: string;
  bgSurface: string;
  textPrimary: string;
  textSecondary: string;
  borderDefault: string;
  accent: string;
  accent2: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
}

// 설정 UI 의 12색 피커 — 라벨/힌트 i18n 키(settings:colorFields.*). 입력 순서 = 표시 순서.
export const BASE_COLOR_FIELDS: { key: keyof BaseColors; labelKey: string; hintKey: string }[] = [
  { key: 'bgBase', labelKey: 'settings:colorFields.bgBase.label', hintKey: 'settings:colorFields.bgBase.hint' },
  { key: 'bgSidebar', labelKey: 'settings:colorFields.bgSidebar.label', hintKey: 'settings:colorFields.bgSidebar.hint' },
  { key: 'bgSurface', labelKey: 'settings:colorFields.bgSurface.label', hintKey: 'settings:colorFields.bgSurface.hint' },
  { key: 'textPrimary', labelKey: 'settings:colorFields.textPrimary.label', hintKey: 'settings:colorFields.textPrimary.hint' },
  { key: 'textSecondary', labelKey: 'settings:colorFields.textSecondary.label', hintKey: 'settings:colorFields.textSecondary.hint' },
  { key: 'borderDefault', labelKey: 'settings:colorFields.borderDefault.label', hintKey: 'settings:colorFields.borderDefault.hint' },
  { key: 'accent', labelKey: 'settings:colorFields.accent.label', hintKey: 'settings:colorFields.accent.hint' },
  { key: 'accent2', labelKey: 'settings:colorFields.accent2.label', hintKey: 'settings:colorFields.accent2.hint' },
  { key: 'success', labelKey: 'settings:colorFields.success.label', hintKey: 'settings:colorFields.success.hint' },
  { key: 'warning', labelKey: 'settings:colorFields.warning.label', hintKey: 'settings:colorFields.warning.hint' },
  { key: 'danger', labelKey: 'settings:colorFields.danger.label', hintKey: 'settings:colorFields.danger.hint' },
  { key: 'info', labelKey: 'settings:colorFields.info.label', hintKey: 'settings:colorFields.info.hint' },
];

// index.css :root (다크) 미러 — 커스텀 시드 / defaults.
export const DARK_BASE: BaseColors = {
  bgBase: '#12151b',
  bgSidebar: '#181b22',
  bgSurface: '#1f232b',
  textPrimary: '#f0f2f7',
  textSecondary: '#cfd3dc',
  borderDefault: '#3a4051',
  accent: '#9eb2ce',
  accent2: '#e6b552',
  success: '#5cbf92',
  warning: '#e69a3b',
  danger: '#f87171',
  info: '#93b6dc',
};

// index.css html.light 미러 — 커스텀 시드.
export const LIGHT_BASE: BaseColors = {
  bgBase: '#f6f3ec',
  bgSidebar: '#fdfaf3',
  bgSurface: '#ffffff',
  textPrimary: '#1a1d24',
  textSecondary: '#3d4250',
  borderDefault: '#d6d0bd',
  accent: '#4a6797',
  accent2: '#a3742d',
  success: '#047857',
  warning: '#b16412',
  danger: '#b91c1c',
  info: '#1d4ed8',
};

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('');
}

/** a 와 b 를 t(0~1) 비율로 선형 혼합. t=0 → a, t=1 → b. */
function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t);
}

const lighten = (hex: string, amt: number) => mix(hex, '#ffffff', amt);
const darken = (hex: string, amt: number) => mix(hex, '#000000', amt);

function rgba(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** 상대 휘도 (WCAG). 0(검정)~1(흰색). */
function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** 배경 hex 위에 얹을 글자색을 대비로 선택 (어두운 남색 / 흰색). */
function pickTextOn(hex: string): string {
  return luminance(hex) > 0.5 ? '#0f172a' : '#ffffff';
}

/** applyTheme 가 'custom' 해제 시 제거할 인라인 토큰 이름 (logo 는 브랜드가 관리). */
export const CUSTOM_TOKEN_NAMES: string[] = [
  '--bg-base', '--bg-sidebar', '--bg-surface', '--bg-surface-2', '--bg-surface-3',
  '--text-primary', '--text-secondary', '--text-muted',
  '--border-default', '--border-strong',
  '--accent', '--accent-hover', '--accent-2', '--accent-soft',
  '--success', '--warning', '--danger', '--info',
  '--bg-success-soft', '--bg-warning-soft', '--bg-danger-soft', '--bg-info-soft', '--bg-neutral-soft',
  '--text-on-success', '--text-on-warning', '--text-on-danger', '--text-on-info', '--text-on-neutral', '--text-on-accent',
  '--code-bg', '--code-fg',
  '--scroll-track', '--scroll-thumb', '--scroll-hover',
  '--ring-accent',
];

/** 핵심 12색 → 전체 CSS 토큰 맵. bgBase 휘도로 다크/라이트 파생 방향을 정한다. */
export function deriveTokens(b: BaseColors): Record<string, string> {
  const isDark = luminance(b.bgBase) < 0.5;
  const onSoft = (c: string) => (isDark ? lighten(c, 0.2) : darken(c, 0.2));
  const up = (c: string, amt: number) => (isDark ? lighten(c, amt) : darken(c, amt));
  return {
    '--bg-base': b.bgBase,
    '--bg-sidebar': b.bgSidebar,
    '--bg-surface': b.bgSurface,
    '--bg-surface-2': up(b.bgSurface, isDark ? 0.08 : 0.05),
    '--bg-surface-3': up(b.bgSurface, isDark ? 0.16 : 0.11),
    '--text-primary': b.textPrimary,
    '--text-secondary': b.textSecondary,
    '--text-muted': mix(b.textSecondary, b.bgBase, 0.35),
    '--border-default': b.borderDefault,
    '--border-strong': up(b.borderDefault, isDark ? 0.12 : 0.18),
    '--accent': b.accent,
    '--accent-hover': isDark ? lighten(b.accent, 0.1) : darken(b.accent, 0.1),
    '--accent-2': b.accent2,
    '--accent-soft': rgba(b.accent, 0.18),
    '--success': b.success,
    '--warning': b.warning,
    '--danger': b.danger,
    '--info': b.info,
    '--bg-success-soft': rgba(b.success, 0.16),
    '--bg-warning-soft': rgba(b.warning, 0.18),
    '--bg-danger-soft': rgba(b.danger, 0.16),
    '--bg-info-soft': rgba(b.info, 0.16),
    '--bg-neutral-soft': rgba(b.textSecondary, 0.12),
    '--text-on-success': onSoft(b.success),
    '--text-on-warning': onSoft(b.warning),
    '--text-on-danger': onSoft(b.danger),
    '--text-on-info': onSoft(b.info),
    '--text-on-neutral': b.textSecondary,
    '--text-on-accent': pickTextOn(b.accent),
    '--code-bg': mix(b.bgSurface, b.bgBase, 0.4),
    '--code-fg': b.accent2,
    '--scroll-track': b.bgSidebar,
    '--scroll-thumb': b.borderDefault,
    '--scroll-hover': up(b.borderDefault, isDark ? 0.12 : 0.18),
    '--ring-accent': rgba(b.accent, 0.7),
  };
}

/** 커스텀 테마가 다크 계열인지 (color-scheme / Toaster theme 매핑용). */
export function isCustomDark(b: BaseColors): boolean {
  return luminance(b.bgBase) < 0.5;
}
