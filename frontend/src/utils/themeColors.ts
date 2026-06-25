import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'custom';

function getCurrentTheme(): ThemeMode {
  if (typeof document === 'undefined') return 'dark';
  const cl = document.documentElement.classList;
  if (cl.contains('custom')) return 'custom';
  // 프리셋은 차트·하드코드 hex 로직을 위해 light/dark 베이스로 환원.
  if (cl.contains('coolLight') || cl.contains('blueberryYogurt')) return 'light';
  if (cl.contains('darkGray') || cl.contains('chocoBanana') || cl.contains('mugwort') || cl.contains('dracula')) return 'dark';
  return cl.contains('light') ? 'light' : 'dark';
}

/** 다크/라이트 테마를 추적하는 훅.
 *  store/settings.ts 의 applyTheme 가 html.classList 의 'light' 클래스를 토글하면
 *  MutationObserver 가 감지해 상태를 갱신한다. 차트처럼 CSS 변수로 못 받는
 *  하드코드 hex 가 필요한 곳에서 사용. */
export function useThemeMode(): ThemeMode {
  const [theme, setTheme] = useState<ThemeMode>(() => getCurrentTheme());
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const update = () => setTheme(getCurrentTheme());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

/** ECharts 옵션에 주입할 다크/라이트 모드별 색 팔레트.
 *  index.css 의 디자인 토큰을 SSR-safe 한 정적 값으로 미러링.
 *  (ECharts 는 CSS 변수를 그대로 받지 않으므로 JS 측에서 값을 꺼내준다.)
 */
export interface ChartColors {
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  axisText: string;
  axisLine: string;
  splitLine: string;
  accent: string;
  accentBar: string;
  mutedBar: string;
  /* Gantt 전용 — 상태별 막대, 마일스톤, 주말 음영, 오늘 표시선, hover 강조.
     index.css 의 success/warning/neutral 토큰을 미러링. */
  ganttBarPlanned: string;
  ganttBarInProgress: string;
  ganttBarDone: string;
  ganttBarParent: string;       // 펼친 부모(자식 합산 범위) — 반투명 얇은 음영
  ganttBarCritical: string;     // 임계경로(CPM) 작업 테두리 강조
  ganttMilestone: string;       // 마일스톤 다이아몬드
  ganttToday: string;           // 오늘 표시선
  ganttWeekend: string;         // 토/일 음영
  ganttRowHover: string;        // 호버 행 좌측 라벨 배경
}

// v2 토큰 (index.css :root) 미러. 변경 시 index.css 와 함께 동기화.
const DARK_CHART_COLORS: ChartColors = {
  tooltipBg:     '#1f232b',                       // --bg-surface
  tooltipBorder: '#3a4051',                       // --border-default
  tooltipText:   '#f0f2f7',                       // --text-primary
  axisText:      '#a8aebd',                       // --text-muted
  axisLine:      '#3a4051',                       // --border-default
  splitLine:     '#2a2f3a',                       // --bg-surface-2 (옅은 divider)
  accent:        '#9eb2ce',                       // --accent
  accentBar:     '#9eb2ce',
  mutedBar:      '#545b6e',                       // --border-strong (Planned 막대 톤)
  ganttBarPlanned:    '#545b6e',
  ganttBarInProgress: '#e69a3b',                  // --warning (v3 amber-orange)
  ganttBarDone:       '#5cbf92',                  // --success (v3 teal-green)
  ganttBarParent:     'rgba(158, 178, 206, 0.35)',  // accent rgba
  ganttBarCritical:   '#f87171',                  // --danger (임계경로)
  ganttMilestone:     '#e6b552',                  // --accent-2 (warm gold)
  ganttToday:         '#f87171',                  // --danger
  ganttWeekend:       'rgba(255, 255, 255, 0.03)',
  ganttRowHover:      'rgba(158, 178, 206, 0.12)',  // accent rgba 옅게
};

// v2 토큰 (index.css html.light) 미러.
const LIGHT_CHART_COLORS: ChartColors = {
  tooltipBg:     '#ffffff',                       // --bg-surface
  tooltipBorder: '#d6d0bd',                       // --border-default (warm beige)
  tooltipText:   '#1a1d24',                       // --text-primary
  axisText:      '#6e7180',                       // --text-muted
  axisLine:      '#d6d0bd',                       // --border-default
  splitLine:     '#e3ddcb',                       // --bg-surface-3 (warm divider)
  accent:        '#4a6797',                       // --accent (deep)
  accentBar:     '#4a6797',
  mutedBar:      '#a39d8a',                       // --border-strong (warm)
  ganttBarPlanned:    '#a39d8a',
  ganttBarInProgress: '#b16412',                  // --warning (brown-orange)
  ganttBarDone:       '#047857',                  // --success
  ganttBarParent:     'rgba(74, 103, 151, 0.30)',   // accent rgba v2
  ganttBarCritical:   '#b91c1c',                  // --danger (임계경로)
  ganttMilestone:     '#a3742d',                  // --accent-2 (warm gold, warning 과 분리)
  ganttToday:         '#b91c1c',                  // --danger
  ganttWeekend:       'rgba(0, 0, 0, 0.035)',
  ganttRowHover:      'rgba(74, 103, 151, 0.10)',   // accent rgba v2 옅게
};

// 커스텀 테마 — applyTheme 가 인라인으로 주입한 CSS 토큰을 그대로 읽어 차트색 구성.
// (ECharts 는 CSS 변수를 못 받으므로 getComputedStyle 로 현재 값을 꺼낸다.)
function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function rgbaFromHexVar(name: string, alpha: number, fallback: string): string {
  const v = cssVar(name, '');
  const h = v.replace('#', '');
  if (h.length < 6) return fallback;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return fallback;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// 현재 --bg-base 가 어두운 계열인지 (커스텀 테마의 명암 방향 판별).
function customIsDark(): boolean {
  const bg = cssVar('--bg-base', '#12151b').replace('#', '');
  const bgN = parseInt(bg.length >= 6 ? bg : '12151b', 16);
  const bgLum = (((bgN >> 16) & 255) + ((bgN >> 8) & 255) + (bgN & 255)) / 3;
  return bgLum < 128;
}

/** 하드코드 hex 그라데이션을 쓰는 차트 헬퍼용 — 'custom' 을 명암 기준 dark/light 로 환원. */
export function effectiveLightDark(theme: ThemeMode): 'dark' | 'light' {
  if (theme === 'dark' || theme === 'light') return theme;
  return customIsDark() ? 'dark' : 'light';
}

function readChartColorsFromCss(): ChartColors {
  const accent = cssVar('--accent', '#9eb2ce');
  const isDark = customIsDark();
  return {
    tooltipBg: cssVar('--bg-surface', '#1f232b'),
    tooltipBorder: cssVar('--border-default', '#3a4051'),
    tooltipText: cssVar('--text-primary', '#f0f2f7'),
    axisText: cssVar('--text-muted', '#a8aebd'),
    axisLine: cssVar('--border-default', '#3a4051'),
    splitLine: cssVar('--bg-surface-2', '#2a2f3a'),
    accent,
    accentBar: accent,
    mutedBar: cssVar('--border-strong', '#545b6e'),
    ganttBarPlanned: cssVar('--border-strong', '#545b6e'),
    ganttBarInProgress: cssVar('--warning', '#f5b955'),
    ganttBarDone: cssVar('--success', '#4ade80'),
    ganttBarParent: rgbaFromHexVar('--accent', 0.35, 'rgba(158, 178, 206, 0.35)'),
    ganttBarCritical: cssVar('--danger', '#f87171'),
    ganttMilestone: cssVar('--accent-2', '#e6b552'),
    ganttToday: cssVar('--danger', '#f87171'),
    ganttWeekend: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.035)',
    ganttRowHover: rgbaFromHexVar('--accent', 0.12, 'rgba(158, 178, 206, 0.12)'),
  };
}

export function getChartColors(theme: ThemeMode): ChartColors {
  if (theme === 'custom') return readChartColorsFromCss();
  return theme === 'light' ? LIGHT_CHART_COLORS : DARK_CHART_COLORS;
}
