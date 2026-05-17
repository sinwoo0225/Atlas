import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

function getCurrentTheme(): ThemeMode {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
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
  ganttBarInProgress: '#f5b955',                  // --warning
  ganttBarDone:       '#4ade80',                  // --success
  ganttBarParent:     'rgba(158, 178, 206, 0.35)',  // accent rgba
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
  ganttMilestone:     '#a3742d',                  // --accent-2 (warm gold, warning 과 분리)
  ganttToday:         '#b91c1c',                  // --danger
  ganttWeekend:       'rgba(0, 0, 0, 0.035)',
  ganttRowHover:      'rgba(74, 103, 151, 0.10)',   // accent rgba v2 옅게
};

export function getChartColors(theme: ThemeMode): ChartColors {
  return theme === 'light' ? LIGHT_CHART_COLORS : DARK_CHART_COLORS;
}
