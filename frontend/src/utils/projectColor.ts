// 프로젝트 id 를 안정적으로 팔레트 인덱스에 매핑.
// 같은 프로젝트는 항상 같은 색·글리프 → 활동 피드에서 시각적 그룹 인식 보조.
// 색맹 보조: 16가지 모양 글리프를 색과 1:1 페어링 — 색만으로 구분 못하는 사용자도 모양으로 변별.

import { useThemeMode, type ThemeMode } from './themeColors';

export const PROJECT_COLOR_COUNT = 16;

// 다크 모드 팔레트 — accent (#9eb2ce) 와 충돌하지 않는 hue spread, 채도 적당.
// 어두운 배경에 떠 있을 때 텍스트 가독성을 위해 중간 채도 + 라이트 텍스트.
// 16색: 8 main hue + 8 shifted hue (약 22.5° 간격).
const DARK_PALETTE: { bg: string; text: string }[] = [
  { bg: '#3b6e7a', text: '#bfe8f0' }, // 0  teal
  { bg: '#6b4f8a', text: '#d8c4f0' }, // 1  purple
  { bg: '#8a5a3b', text: '#f0d4bc' }, // 2  amber-brown
  { bg: '#4a6b3b', text: '#cce4bc' }, // 3  green
  { bg: '#8a3b5e', text: '#f0bcd0' }, // 4  magenta
  { bg: '#3b528a', text: '#bcc8f0' }, // 5  indigo
  { bg: '#7a6b3b', text: '#e8d8a8' }, // 6  olive
  { bg: '#6b3b3b', text: '#f0bcbc' }, // 7  rust
  { bg: '#3b8a7e', text: '#bcf0e0' }, // 8  cyan
  { bg: '#5e3b8a', text: '#c8bcf0' }, // 9  violet
  { bg: '#8a4b3b', text: '#f0c4b8' }, // 10 coral
  { bg: '#5e8a3b', text: '#d8f0bc' }, // 11 lime
  { bg: '#8a3b7a', text: '#f0bce4' }, // 12 pink
  { bg: '#3b6b8a', text: '#bce0f0' }, // 13 slate-blue
  { bg: '#8a7a3b', text: '#f0e8bc' }, // 14 mustard
  { bg: '#7a4b3b', text: '#f0cbb8' }, // 15 salmon
];

// 라이트 모드 — 동일 hue 의 옅은 배경 + 진한 텍스트.
const LIGHT_PALETTE: { bg: string; text: string }[] = [
  { bg: '#d8eef2', text: '#1e4a52' }, // 0  teal
  { bg: '#e6dcf2', text: '#3d2a5c' }, // 1  purple
  { bg: '#f2e0cc', text: '#5c3a1e' }, // 2  amber-brown
  { bg: '#dcedcc', text: '#2c4a1e' }, // 3  green
  { bg: '#f2d4e0', text: '#5c1e3a' }, // 4  magenta
  { bg: '#d4dcf2', text: '#1e2a5c' }, // 5  indigo
  { bg: '#ede6c4', text: '#4a3d1e' }, // 6  olive
  { bg: '#f2d4d4', text: '#5c1e1e' }, // 7  rust
  { bg: '#ccf2e8', text: '#1e5247' }, // 8  cyan
  { bg: '#dcd4f2', text: '#2a1e5c' }, // 9  violet
  { bg: '#f2dccc', text: '#5c2e1e' }, // 10 coral
  { bg: '#e4f2d4', text: '#3d521e' }, // 11 lime
  { bg: '#f2d4ec', text: '#521e47' }, // 12 pink
  { bg: '#d4e6f2', text: '#1e3d52' }, // 13 slate-blue
  { bg: '#f2ecd4', text: '#52471e' }, // 14 mustard
  { bg: '#f2d8cc', text: '#52261e' }, // 15 salmon
];

// 색맹 보조 — 색과 1:1 페어. 같은 인덱스의 색·글리프는 항상 함께 표시된다.
// 채움 8개 + 비움/변형 8개로 페어링해 동일 hue 끼리도 변별 가능.
const GLYPHS = [
  '●', '■', '▲', '◆', '★', '◐', '▼', '♥',
  '○', '□', '△', '◇', '✦', '◑', '▽', '♡',
];

export function projectColorIndex(id: number): number {
  return ((id % PROJECT_COLOR_COUNT) + PROJECT_COLOR_COUNT) % PROJECT_COLOR_COUNT;
}

export function projectGlyph(id: number): string {
  return GLYPHS[projectColorIndex(id)];
}

export function getProjectColor(id: number, theme: ThemeMode): { bg: string; text: string; glyph: string } {
  const i = projectColorIndex(id);
  const palette = theme === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
  return { ...palette[i], glyph: GLYPHS[i] };
}

export function useProjectColor(id: number): { bg: string; text: string; glyph: string } {
  const theme = useThemeMode();
  return getProjectColor(id, theme);
}
