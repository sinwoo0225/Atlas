import { create } from 'zustand';

// 릴리즈 노트 모달의 열림 상태. 두 경로가 이 store 로 연다:
//  1) 업데이트 알림(showUpdate) — GitHub release body 를 그때그때 받아온다(온라인, 대기 중 새 버전용).
//  2) 설정 > 정보 '이 버전의 새로운 기능'(showBundled) — 앱에 번들된 현재 버전 노트를 바로 표시(오프라인·Store 동작).
// MainShell 이 ReleaseNotesModalHost 를 한 곳에서 렌더한다.
interface ReleaseNotesModalState {
  open: boolean;
  version: string | null;
  // 번들 노트(현재 버전). 값이 있으면 모달이 fetch 없이 이걸 그대로 표시한다.
  bundled: string | null;
  showUpdate: (version?: string) => void;
  showBundled: (version: string, notes: string) => void;
  close: () => void;
}

export const useReleaseNotesModal = create<ReleaseNotesModalState>((set) => ({
  open: false,
  version: null,
  bundled: null,
  showUpdate: (version) => set({ open: true, version: version ?? null, bundled: null }),
  showBundled: (version, notes) => set({ open: true, version, bundled: notes }),
  close: () => set({ open: false }),
}));
