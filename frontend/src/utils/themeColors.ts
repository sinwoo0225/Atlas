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
}

const DARK_CHART_COLORS: ChartColors = {
  tooltipBg:     '#202022',
  tooltipBorder: '#3f3f46',
  tooltipText:   '#f4f4f5',
  axisText:      '#b4b4bb',
  axisLine:      '#3f3f46',
  splitLine:     '#2a2a2c',
  accent:        '#9eb2ce',
  accentBar:     '#9eb2ce',
  mutedBar:      '#6b7280',
};

const LIGHT_CHART_COLORS: ChartColors = {
  tooltipBg:     '#ffffff',
  tooltipBorder: '#d1d5db',
  tooltipText:   '#111827',
  axisText:      '#6b7280',
  axisLine:      '#d1d5db',
  splitLine:     '#e5e7eb',
  accent:        '#5b7299',
  accentBar:     '#5b7299',
  mutedBar:      '#9ca3af',
};

export function getChartColors(theme: ThemeMode): ChartColors {
  return theme === 'light' ? LIGHT_CHART_COLORS : DARK_CHART_COLORS;
}
