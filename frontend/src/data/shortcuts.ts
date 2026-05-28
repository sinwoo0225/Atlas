export interface ShortcutEntry {
  keys: string[];
  desc: string;
}

export interface ShortcutGroup {
  group: string;
  items: ShortcutEntry[];
}

// 단일 진실 소스 — ShortcutsModal 이 이것을 렌더링한다. 새 단축키 도입 시 여기 한 곳 갱신.
export const SHORTCUT_REGISTRY: ShortcutGroup[] = [
  {
    group: '전역',
    items: [
      { keys: ['Ctrl', 'K'], desc: '검색·명령 팔레트 열기 (빈 입력/> 로 명령)' },
      { keys: ['Ctrl', 'B'], desc: '사이드바 접기/펼치기' },
      { keys: ['?'], desc: '단축키 도움말 열기' },
      { keys: ['Esc'], desc: '열린 모달/팔레트 닫기' },
    ],
  },
  {
    group: '탐색 (G 후 키)',
    items: [
      { keys: ['G', 'D'], desc: '대시보드' },
      { keys: ['G', 'I'], desc: '이슈' },
      { keys: ['G', 'W'], desc: '일정/WBS' },
      { keys: ['G', 'M'], desc: '회의록' },
      { keys: ['G', 'C'], desc: '변경이력' },
      { keys: ['G', 'V'], desc: '개발정보' },
      { keys: ['G', 'R'], desc: '리소스' },
      { keys: ['G', 'S'], desc: '설정' },
    ],
  },
  {
    group: '페이지 작업',
    items: [
      { keys: ['Ctrl', 'N'], desc: '신규 항목 생성 (현재 페이지 컨텍스트)' },
      { keys: ['Enter'], desc: '이슈 페이지 — 마지막 빈 행에서 추가' },
    ],
  },
  {
    group: '모달',
    items: [
      { keys: ['Tab'], desc: '모달 안 다음 요소' },
      { keys: ['Shift', 'Tab'], desc: '모달 안 이전 요소' },
      { keys: ['Esc'], desc: '닫기 (변경사항 있으면 확인)' },
    ],
  },
  {
    group: '프로젝트 맵',
    items: [
      { keys: ['1'], desc: 'WBS 노드 토글' },
      { keys: ['2'], desc: '변경이력 노드 토글' },
      { keys: ['3'], desc: '회의록 노드 토글' },
      { keys: ['4'], desc: '개발정보 노드 토글' },
      { keys: ['5'], desc: '이슈 노드 토글' },
      { keys: ['/'], desc: '검색 입력 포커스' },
      { keys: ['F'], desc: '맵 fit 리셋' },
    ],
  },
];

// SettingsPage 등 다른 곳에서 ShortcutsModal 을 여는 트리거.
// ShortcutsModal 이 이 이벤트를 리스닝한다 (atlas:settings-changed 와 같은 패턴).
export const SHORTCUTS_OPEN_EVENT = 'atlas:shortcuts-open';

export function openShortcutsModal(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SHORTCUTS_OPEN_EVENT));
}
