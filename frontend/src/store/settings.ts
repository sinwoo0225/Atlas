export type ThemeMode = 'dark' | 'light';

export interface AppSettings {
  theme: ThemeMode;
  autoSelectLastProject: boolean;
  lastProjectId: number | null;
  defaultAuthor: string;
}

const KEY = 'pm-hub-settings';

const defaults: AppSettings = {
  theme: 'dark',
  autoSelectLastProject: true,
  lastProjectId: null,
  defaultAuthor: '',
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
