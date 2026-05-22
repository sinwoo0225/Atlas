import {
  type BaseColors,
  DARK_BASE,
  CUSTOM_TOKEN_NAMES,
  deriveTokens,
  isCustomDark,
} from '../utils/themeCustom';
import { setHostBrand } from '../utils/hostBridge';

export type ThemeMode = 'dark' | 'light' | 'custom';

export interface AppSettings {
  theme: ThemeMode;
  autoSelectLastProject: boolean;
  lastProjectId: number | null;
  defaultAuthor: string;
  markdownFontSize: number;
  markdownLineHeight: number;
  sidebarCollapsed: boolean;
  // 통합 모니터링 '작업' 탭을 열 때 기본 보기 (URL 에 view 파라미터가 없을 때 적용).
  defaultTaskView: 'list' | 'calendar';
  // 회의록 'AI 요약' 버튼 노출 여부. 로컬 Claude CLI 가 있어야 동작 — 설정에서 옵트인.
  aiSummaryEnabled: boolean;
  // theme === 'custom' 일 때 사용할 핵심 12색. 다크/라이트 시드로 채워 편집.
  customColors: BaseColors;
  // 브랜드 워드마크 — 'At'(primary) + 'las'(accent) 분할, 색 2개, 탭/창 제목.
  brandPrimaryText: string;
  brandAccentText: string;
  brandTitle: string;
  brandLogoPrimary: string;
  brandLogoAccent: string;
  // 작업표시줄/창 아이콘 (data URL). 비어 있으면 기본 atlas.ico. exe 파일 아이콘과는 별개(런타임 전용).
  brandIcon: string;
  // 아이콘 오버라이드 — 슬롯키 → lucide 아이콘 이름. 비어 있으면 기본 아이콘 사용.
  menuIcons: Record<string, string>;
  entityIcons: Record<string, string>;
}

const KEY = 'pm-hub-settings';

export const MARKDOWN_FONT_SIZE_RANGE = { min: 11, max: 22, step: 0.5 } as const;
export const MARKDOWN_LINE_HEIGHT_RANGE = { min: 1.2, max: 2.4, step: 0.05 } as const;

export const DEFAULT_LOGO_PRIMARY = '#7c8db5';
export const DEFAULT_LOGO_ACCENT = '#c9a96b';

const defaults: AppSettings = {
  theme: 'dark',
  autoSelectLastProject: true,
  lastProjectId: null,
  defaultAuthor: '',
  markdownFontSize: 14,
  markdownLineHeight: 1.7,
  sidebarCollapsed: false,
  defaultTaskView: 'list',
  aiSummaryEnabled: false,
  customColors: { ...DARK_BASE },
  brandPrimaryText: 'At',
  brandAccentText: 'las',
  brandTitle: 'Atlas',
  brandLogoPrimary: DEFAULT_LOGO_PRIMARY,
  brandLogoAccent: DEFAULT_LOGO_ACCENT,
  brandIcon: '',
  menuIcons: {},
  entityIcons: {},
};

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return { ...defaults };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    // 중첩 객체는 얕은 머지로는 누락 키가 생길 수 있어 개별 보정.
    return {
      ...defaults,
      ...parsed,
      customColors: { ...defaults.customColors, ...(parsed.customColors ?? {}) },
      menuIcons: { ...(parsed.menuIcons ?? {}) },
      entityIcons: { ...(parsed.entityIcons ?? {}) },
    };
  } catch {
    return { ...defaults };
  }
}

export function getDefaultSettings(): AppSettings {
  return { ...defaults, customColors: { ...defaults.customColors }, menuIcons: {}, entityIcons: {} };
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function patchSettings(patch: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const next = { ...current, ...patch };
  saveSettings(next);
  return next;
}

// 첫 부팅 시 머신 계정명으로 작성자를 한 번 시드. 이미 값이 있으면 건드리지 않음.
export function seedDefaultAuthorIfEmpty(userName: string): void {
  const trimmed = userName.trim();
  if (!trimmed) return;
  const current = loadSettings();
  if (current.defaultAuthor !== '') return;
  patchSettings({ defaultAuthor: trimmed });
}

export function applyTheme(theme: ThemeMode, customColors?: BaseColors): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const clearCustom = () => CUSTOM_TOKEN_NAMES.forEach((n) => root.style.removeProperty(n));

  if (theme === 'custom') {
    const base = customColors ?? DARK_BASE;
    root.classList.remove('light');
    root.classList.add('custom');
    const tokens = deriveTokens(base);
    Object.entries(tokens).forEach(([name, value]) => root.style.setProperty(name, value));
    root.style.colorScheme = isCustomDark(base) ? 'dark' : 'light';
    return;
  }

  root.classList.remove('custom');
  root.style.removeProperty('color-scheme');
  clearCustom();
  if (theme === 'light') {
    root.classList.add('light');
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
    root.classList.remove('light');
  }
}

// 워드마크 두 색은 테마와 무관하게 항상 인라인 적용 (다크/라이트/커스텀 공통 정체성).
export function applyBrandColors(primary: string, accent: string): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--logo-primary', primary);
  root.style.setProperty('--logo-accent', accent);
}

export function applyMarkdownStyle(fontSize: number, lineHeight: number): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--md-font-size', `${fontSize}px`);
  root.style.setProperty('--md-line-height', String(lineHeight));
}

// 부트/설정 변경 시 외관 설정을 일괄 적용 (테마·로고색·문서 제목·마크다운).
export function applyAppearance(s: AppSettings): void {
  applyTheme(s.theme, s.customColors);
  applyBrandColors(s.brandLogoPrimary, s.brandLogoAccent);
  applyMarkdownStyle(s.markdownFontSize, s.markdownLineHeight);
  const title = s.brandTitle.trim() || 'Atlas';
  if (typeof document !== 'undefined') {
    // 브라우저 탭 제목 (dev / 일반 브라우저).
    document.title = title;
    // 파비콘 동기화 — brandIcon 이 있으면 교체 (dev 가시성). 없으면 기존 파비콘 유지.
    if (s.brandIcon) applyFavicon(s.brandIcon);
  }
  // 데스크톱 앱: 네이티브 제목 표시줄 워드마크 + OS 창 제목 + 작업표시줄 아이콘 (브라우저면 no-op).
  setHostBrand({
    primaryText: s.brandPrimaryText,
    accentText: s.brandAccentText,
    primaryColor: s.brandLogoPrimary,
    accentColor: s.brandLogoAccent,
    title,
    iconDataUrl: s.brandIcon,
  });
}

function applyFavicon(href: string): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
}
