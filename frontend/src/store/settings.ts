import {
  type BaseColors,
  DARK_BASE,
  CUSTOM_TOKEN_NAMES,
  deriveTokens,
  isCustomDark,
} from '../utils/themeCustom';
import { setHostBrand, setHostTheme } from '../utils/hostBridge';

// dark/light = 기본(blue 다크·warm 라이트), darkGray/coolLight = 중립 그레이 프리셋,
// chocoBanana = 다크 초코+바나나, mugwort = 짙은 쑥+하양, dracula = 검정·묵색+선명빨강,
// blueberryYogurt = 요거트 화이트+블루베리 라이트, custom = 사용자 색.
export type ThemeMode = 'dark' | 'darkGray' | 'chocoBanana' | 'mugwort' | 'dracula' | 'light' | 'coolLight' | 'blueberryYogurt' | 'custom';

// 테마 모드를 sonner Toaster·color-scheme 매핑용 light/dark 베이스로 환원.
export function resolveToasterTheme(theme: ThemeMode, customColors: BaseColors): 'light' | 'dark' {
  if (theme === 'custom') return isCustomDark(customColors) ? 'dark' : 'light';
  return theme === 'light' || theme === 'coolLight' || theme === 'blueberryYogurt' ? 'light' : 'dark';
}
export type Language = 'ko' | 'en';

// 알림 설정 — 항목별(마감 임박 / 일일 업무 정리) 활성·주기·범위.
// 향후 알림 종류 추가 시 이 구조에 하위 객체를 더한다(알림 소스 레지스트리와 1:1).
export interface NotificationSettings {
  // 마스터 스위치 — 끄면 모든 알림 비활성.
  enabled: boolean;
  // 마감 임박 폴링 주기(분). 최소 5.
  pollIntervalMinutes: number;
  // 앱 창이 최소화/숨김일 때 네이티브 always-on-top 창으로도 토스트 노출(데스크톱 전용).
  showWhenMinimized: boolean;
  // 마감 임박 일정/이슈.
  deadline: {
    enabled: boolean;
    // 'mine' = 내가 담당인 작업만 / 'all' = 전체 작업.
    scope: 'mine' | 'all';
    // 마감 며칠 전부터 임박으로 볼지.
    withinDays: number;
    // 이미 지난(마감 초과) 항목도 알릴지.
    includeOverdue: boolean;
    // 신규 임박 건수가 이 값을 넘으면 항목별 대신 묶음 토스트 1개.
    aggregateThreshold: number;
  };
  // 일일 업무 정리 — 매일 지정 시각 안내.
  dailySummary: {
    enabled: boolean;
    // 'HH:MM' 24시간.
    time: string;
  };
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  pollIntervalMinutes: 30,
  showWhenMinimized: true,
  deadline: { enabled: true, scope: 'mine', withinDays: 3, includeOverdue: true, aggregateThreshold: 3 },
  dailySummary: { enabled: true, time: '09:00' },
};

// 중첩 객체라 매 로드 시 새 인스턴스로 깊은 복제(참조 공유 방지).
function cloneNotificationDefaults(): NotificationSettings {
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    deadline: { ...DEFAULT_NOTIFICATION_SETTINGS.deadline },
    dailySummary: { ...DEFAULT_NOTIFICATION_SETTINGS.dailySummary },
  };
}

export interface AppSettings {
  theme: ThemeMode;
  // 화면 텍스트 표시 언어. 기본 ko. 설정에서 토글하면 라이브 전환 + <html lang> 갱신.
  language: Language;
  autoSelectLastProject: boolean;
  lastProjectId: number | null;
  defaultAuthor: string;
  // '나' 신원 — defaultAuthor 이름으로 resolve 한 Person 리소스 ID. TODO('내 업무') 집계의 기준.
  // 설정에서 내 이름을 저장할 때 /resources/resolve 로 채워진다. null 이면 미연동.
  myResourceId: number | null;
  markdownFontSize: number;
  markdownLineHeight: number;
  sidebarCollapsed: boolean;
  // 통합 모니터링 '작업' 탭을 열 때 기본 보기 (URL 에 view 파라미터가 없을 때 적용).
  defaultTaskView: 'list' | 'calendar' | 'kanban';
  // WBS/일정 필터 기억 옵트인. ON 이면 프로젝트별 필터 선택을 저장(atlas:wbsFilters:<id>)해 다음 방문 시 복원.
  rememberWbsFilters: boolean;
  // 업무일지 자동 작성/등록 범위. 'all'=전체 작업, 'mine'=내(myResourceId) 담당 작업만.
  // 적용: WBS/이슈 상태 변경 시 자동 일지 등록 + '진행 항목 자동 작성' 버튼. (X-Atlas-WorkLog-Scope 헤더로 백엔드 전달)
  workLogScope: 'mine' | 'all';
  // 주간 업무일지(통합 모니터링 '일지') 통합 방식. 'byDay'=요일별(기존), 'finalState'=요일 합쳐 작업별 최종 상태.
  weeklyWorkLogMode: 'byDay' | 'finalState';
  // 회의록 'AI 요약' 버튼 노출 여부. 로컬 Claude CLI 가 있어야 동작 — 설정에서 옵트인.
  aiSummaryEnabled: boolean;
  // 위젯 '최근 활성 창' 추적 ON/OFF (프라이버시). 기본 ON. 창 제목은 이 PC 메모리에만, 외부 전송 없음.
  widgetActiveWindowsEnabled: boolean;
  // 위젯 날씨 위치 (옵트인). 미설정(null)이면 날씨 미표시. 좌표는 open-meteo 조회용.
  widgetWeatherLat: number | null;
  widgetWeatherLon: number | null;
  widgetWeatherLabel: string;
  // 위젯 레이아웃 — false=컴팩트(1열) / true=확장(2열, 더 넓은 창).
  widgetExpanded: boolean;
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
  // 알림(마감 임박 / 일일 업무 정리) 설정.
  notifications: NotificationSettings;
}

const KEY = 'pm-hub-settings';

export const MARKDOWN_FONT_SIZE_RANGE = { min: 11, max: 22, step: 0.5 } as const;
export const MARKDOWN_LINE_HEIGHT_RANGE = { min: 1.2, max: 2.4, step: 0.05 } as const;

export const DEFAULT_LOGO_PRIMARY = '#7c8db5';
export const DEFAULT_LOGO_ACCENT = '#c9a96b';

const defaults: AppSettings = {
  theme: 'dark',
  language: 'ko',
  autoSelectLastProject: true,
  lastProjectId: null,
  defaultAuthor: '',
  myResourceId: null,
  markdownFontSize: 14,
  markdownLineHeight: 1.7,
  sidebarCollapsed: false,
  defaultTaskView: 'list',
  rememberWbsFilters: false,
  workLogScope: 'all',
  weeklyWorkLogMode: 'byDay',
  aiSummaryEnabled: false,
  widgetActiveWindowsEnabled: true,
  widgetWeatherLat: null,
  widgetWeatherLon: null,
  widgetWeatherLabel: '',
  widgetExpanded: false,
  customColors: { ...DARK_BASE },
  brandPrimaryText: 'At',
  brandAccentText: 'las',
  brandTitle: 'Atlas',
  brandLogoPrimary: DEFAULT_LOGO_PRIMARY,
  brandLogoAccent: DEFAULT_LOGO_ACCENT,
  brandIcon: '',
  menuIcons: {},
  entityIcons: {},
  notifications: cloneNotificationDefaults(),
};

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return { ...defaults };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    // 중첩 객체는 얕은 머지로는 누락 키가 생길 수 있어 개별 보정.
    const pn = parsed.notifications ?? {};
    return {
      ...defaults,
      ...parsed,
      customColors: { ...defaults.customColors, ...(parsed.customColors ?? {}) },
      menuIcons: { ...(parsed.menuIcons ?? {}) },
      entityIcons: { ...(parsed.entityIcons ?? {}) },
      notifications: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...pn,
        deadline: { ...DEFAULT_NOTIFICATION_SETTINGS.deadline, ...(pn.deadline ?? {}) },
        dailySummary: { ...DEFAULT_NOTIFICATION_SETTINGS.dailySummary, ...(pn.dailySummary ?? {}) },
      },
    };
  } catch {
    return { ...defaults };
  }
}

export function getDefaultSettings(): AppSettings {
  return { ...defaults, customColors: { ...defaults.customColors }, menuIcons: {}, entityIcons: {}, notifications: cloneNotificationDefaults() };
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

// <html> 에 붙는 테마 클래스 전체 — 전환 시 모두 제거 후 해당 모드 클래스 하나만 부여.
const THEME_CLASSES = ['dark', 'darkGray', 'chocoBanana', 'mugwort', 'dracula', 'light', 'coolLight', 'blueberryYogurt', 'custom'];

export function applyTheme(theme: ThemeMode, customColors?: BaseColors): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const clearCustom = () => CUSTOM_TOKEN_NAMES.forEach((n) => root.style.removeProperty(n));

  if (theme === 'custom') {
    const base = customColors ?? DARK_BASE;
    THEME_CLASSES.forEach((c) => root.classList.remove(c));
    root.classList.add('custom');
    const tokens = deriveTokens(base);
    Object.entries(tokens).forEach(([name, value]) => root.style.setProperty(name, value));
    root.style.colorScheme = isCustomDark(base) ? 'dark' : 'light';
    return;
  }

  root.style.removeProperty('color-scheme');
  clearCustom();
  // 모드명을 그대로 클래스로 부여: dark(=:root 기본)·light·coolLight·darkGray.
  // html.light/coolLight/darkGray 블록이 토큰을 override, dark 는 :root 기본 적용.
  THEME_CLASSES.forEach((c) => root.classList.remove(c));
  root.classList.add(theme);
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
    // 화면 텍스트 언어를 <html lang> 에 반영 (i18n.changeLanguage 는 App 리스너에서 별도 호출).
    document.documentElement.lang = s.language;
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
  // 데스크톱 앱: 커스텀 제목 표시줄·창·캡션 버튼을 인앱 테마 색에 동기화 (브라우저면 no-op).
  // applyTheme() 직후라 getComputedStyle 이 새 테마(dark/light/custom)의 토큰을 반환한다.
  if (typeof document !== 'undefined') {
    const read = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    setHostTheme({
      bg: read('--bg-surface'),
      fg: read('--text-muted'),
      fgStrong: read('--text-primary'),
      hoverBg: read('--bg-surface-3'),
      border: read('--border-default'),
    });
  }
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
