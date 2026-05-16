import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useProjectStore } from '../store/useProjectStore';
import { pushRecent } from '../utils/recentItems';

// /projects/:pid/:section 매칭. App.tsx (Layout 안쪽) 에서 한 번 mount.
const PROJECT_ROUTE = /^\/projects\/(\d+)\/([\w-]+)/;

export function useRecentTracker() {
  const location = useLocation();
  const projects = useProjectStore((s) => s.projects);

  useEffect(() => {
    const match = location.pathname.match(PROJECT_ROUTE);
    if (!match) return;
    const projectId = parseInt(match[1], 10);
    const section = match[2];
    if (!Number.isFinite(projectId)) return;
    const project = projects.find((p) => p.id === projectId);
    if (!project) return; // 아직 프로젝트 list 로드 전이면 다음 effect 에서 처리됨
    pushRecent({
      path: `/projects/${projectId}/${section}`,
      projectId,
      projectName: project.name,
      section,
    });
  }, [location.pathname, projects]);
}
