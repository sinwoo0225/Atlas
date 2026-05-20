export type ThemeMode = 'dark' | 'light';

export interface AppSettings {
  theme: ThemeMode;
  autoSelectLastProject: boolean;
  lastProjectId: number | null;
  defaultAuthor: string;
  markdownFontSize: number;
  markdownLineHeight: number;
  sidebarCollapsed: boolean;
  // 회의록 'AI 요약' 버튼 노출 여부. 로컬 Claude CLI 가 있어야 동작 — 설정에서 옵트인.
  aiSummaryEnabled: boolean;
}

const KEY = 'pm-hub-settings';

export const MARKDOWN_FONT_SIZE_RANGE = { min: 11, max: 22, step: 0.5 } as const;
export const MARKDOWN_LINE_HEIGHT_RANGE = { min: 1.2, max: 2.4, step: 0.05 } as const;

const defaults: AppSettings = {
  theme: 'dark',
  autoSelectLastProject: true,
  lastProjectId: null,
  defaultAuthor: '',
  markdownFontSize: 14,
  markdownLineHeight: 1.7,
  sidebarCollapsed: false,
  aiSummaryEnabled: false,
};

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return { ...defaults };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
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

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'light') {
    root.classList.add('light');
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
    root.classList.remove('light');
  }
}

export function applyMarkdownStyle(fontSize: number, lineHeight: number): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--md-font-size', `${fontSize}px`);
  root.style.setProperty('--md-line-height', String(lineHeight));
}
