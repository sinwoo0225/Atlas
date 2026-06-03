export interface ShortcutEntry {
  keys: string[];
  // 설명은 shortcuts 네임스페이스의 i18n 키. ShortcutsModal 이 t(descKey) 로 해석.
  descKey: string;
}

export interface ShortcutGroup {
  groupKey: string;
  items: ShortcutEntry[];
}

// 단일 진실 소스 — ShortcutsModal 이 이것을 렌더링한다. 새 단축키 도입 시 여기 + shortcuts.json 갱신.
export const SHORTCUT_REGISTRY: ShortcutGroup[] = [
  {
    groupKey: 'shortcuts:group.global',
    items: [
      { keys: ['Ctrl', 'K'], descKey: 'shortcuts:desc.openPalette' },
      { keys: ['Ctrl', 'B'], descKey: 'shortcuts:desc.toggleSidebar' },
      { keys: ['?'], descKey: 'shortcuts:desc.openShortcuts' },
      { keys: ['Esc'], descKey: 'shortcuts:desc.closeModal' },
    ],
  },
  {
    groupKey: 'shortcuts:group.navigate',
    items: [
      { keys: ['G', 'D'], descKey: 'shortcuts:desc.goDashboard' },
      { keys: ['G', 'I'], descKey: 'shortcuts:desc.goIssues' },
      { keys: ['G', 'W'], descKey: 'shortcuts:desc.goWbs' },
      { keys: ['G', 'M'], descKey: 'shortcuts:desc.goMeetings' },
      { keys: ['G', 'C'], descKey: 'shortcuts:desc.goChangelogs' },
      { keys: ['G', 'V'], descKey: 'shortcuts:desc.goDevinfo' },
      { keys: ['G', 'R'], descKey: 'shortcuts:desc.goResources' },
      { keys: ['G', 'S'], descKey: 'shortcuts:desc.goSettings' },
    ],
  },
  {
    groupKey: 'shortcuts:group.page',
    items: [
      { keys: ['Ctrl', 'N'], descKey: 'shortcuts:desc.newItem' },
      { keys: ['Enter'], descKey: 'shortcuts:desc.issueEnterAdd' },
    ],
  },
  {
    groupKey: 'shortcuts:group.modal',
    items: [
      { keys: ['Tab'], descKey: 'shortcuts:desc.modalNext' },
      { keys: ['Shift', 'Tab'], descKey: 'shortcuts:desc.modalPrev' },
      { keys: ['Esc'], descKey: 'shortcuts:desc.modalClose' },
    ],
  },
  {
    groupKey: 'shortcuts:group.map',
    items: [
      { keys: ['1'], descKey: 'shortcuts:desc.mapToggleWbs' },
      { keys: ['2'], descKey: 'shortcuts:desc.mapToggleChangelog' },
      { keys: ['3'], descKey: 'shortcuts:desc.mapToggleMeeting' },
      { keys: ['4'], descKey: 'shortcuts:desc.mapToggleDevinfo' },
      { keys: ['5'], descKey: 'shortcuts:desc.mapToggleIssue' },
      { keys: ['/'], descKey: 'shortcuts:desc.mapFocusSearch' },
      { keys: ['F'], descKey: 'shortcuts:desc.mapFitReset' },
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
