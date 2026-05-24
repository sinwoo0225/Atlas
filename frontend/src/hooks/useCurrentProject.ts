import { useParams } from 'react-router-dom';
import { useProjectStore } from '../store/useProjectStore';

/**
 * 현재 URL 의 `:projectId` 에 해당하는 프로젝트(스토어 기준). 없으면 null.
 * 프로젝트 스코프 페이지 헤더의 breadcrumb(= 프로젝트명) 등 "지금 어느 프로젝트" 표시에 사용.
 * 스토어 projects 가 늦게 로드되면 처음엔 null → 로드 후 자연 갱신(graceful).
 */
export function useCurrentProject() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = projectId ? Number(projectId) : null;
  return useProjectStore((s) => s.projects.find((p) => p.id === pid) ?? null);
}
