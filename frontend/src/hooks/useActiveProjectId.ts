import { useLocation } from 'react-router-dom';
import { useProjectStore } from '../store/useProjectStore';
import { loadSettings } from '../store/settings';

// 활성 프로젝트 판별 — URL → store → lastProjectId 순 fallback.
// G-chord(Layout) 와 명령 팔레트가 공유하는 단일 소스. 호출 시점 기준으로 해석하도록 함수를 반환한다.
export function useActiveProjectId(): () => number | null {
  const location = useLocation();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  return () => {
    const urlMatch = location.pathname.match(/^\/projects\/(\d+)\//);
    if (urlMatch) return Number(urlMatch[1]);
    if (selectedProjectId !== null) return selectedProjectId;
    return loadSettings().lastProjectId;
  };
}
