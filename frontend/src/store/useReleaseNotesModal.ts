import { create } from 'zustand';

// 릴리즈 노트 모달의 열림 상태. 알림/설정 어디서든 열 수 있고, MainShell 이 한 곳에서 렌더한다.
// 노트 본문(마크다운)은 여기 담지 않는다 — 모달이 열릴 때 systemApi.getUpdateStatus() 로
// 최신 releaseNotes 를 가져온다(본문이 커서 상태에 실어 나르지 않는다).
interface ReleaseNotesModalState {
  open: boolean;
  version: string | null;
  show: (version?: string) => void;
  close: () => void;
}

export const useReleaseNotesModal = create<ReleaseNotesModalState>((set) => ({
  open: false,
  version: null,
  show: (version) => set({ open: true, version: version ?? null }),
  close: () => set({ open: false }),
}));
