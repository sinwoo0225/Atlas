import { useCallback, useEffect, useState } from 'react';
import { issuesApi } from '../api/issues';
import type { IssueCustomColumn, IssueCustomColumnType } from '../types';

// 커스텀 컬럼 정의를 프로젝트 단위로 로드·편집. 소비측(렌더·모달)은 출처(DB/localStorage)에 무관하게
// 이 훅의 API 만 사용 — 저장소를 바꿔도 이 파일만 교체하면 된다.

const sortCols = (cols: IssueCustomColumn[]): IssueCustomColumn[] =>
  [...cols].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

// 표시명과 무관한 안정 key — 기존 key 와 충돌하지 않는 c1,c2… 슬러그.
function makeKey(existing: IssueCustomColumn[]): string {
  const taken = new Set(existing.map((c) => c.key));
  let n = existing.length + 1;
  while (taken.has(`c${n}`)) n += 1;
  return `c${n}`;
}

export interface UseIssueColumns {
  columns: IssueCustomColumn[];
  addColumn: (name: string, type: IssueCustomColumnType) => void;
  renameColumn: (key: string, name: string) => void;
  removeColumn: (key: string) => void;
  moveColumn: (key: string, dir: 'up' | 'down') => void;
}

export function useIssueColumns(projectId: number): UseIssueColumns {
  const [columns, setColumns] = useState<IssueCustomColumn[]>([]);

  useEffect(() => {
    let alive = true;
    issuesApi.getColumns(projectId)
      .then((cols) => { if (alive) setColumns(sortCols(cols)); })
      .catch(() => { /* 토스트는 api/client.ts */ });
    return () => { alive = false; };
  }, [projectId]);

  // 각 mutator: 낙관적 갱신(setColumns) + 전체 배열 PUT, 실패 시 직전 값으로 롤백.
  const addColumn = useCallback((name: string, type: IssueCustomColumnType) => {
    setColumns((prev) => {
      const col: IssueCustomColumn = {
        key: makeKey(prev),
        name: name.trim(),
        type,
        order: prev.length ? Math.max(...prev.map((c) => c.order)) + 1 : 0,
      };
      const next = sortCols([...prev, col]);
      issuesApi.saveColumns(projectId, next).catch(() => setColumns(prev));
      return next;
    });
  }, [projectId]);

  const renameColumn = useCallback((key: string, name: string) => {
    setColumns((prev) => {
      const next = prev.map((c) => (c.key === key ? { ...c, name: name.trim() } : c));
      issuesApi.saveColumns(projectId, sortCols(next)).catch(() => setColumns(prev));
      return sortCols(next);
    });
  }, [projectId]);

  const removeColumn = useCallback((key: string) => {
    setColumns((prev) => {
      const next = prev.filter((c) => c.key !== key);
      issuesApi.saveColumns(projectId, next).catch(() => setColumns(prev));
      return next;
    });
  }, [projectId]);

  const moveColumn = useCallback((key: string, dir: 'up' | 'down') => {
    setColumns((prev) => {
      const sorted = sortCols(prev);
      const idx = sorted.findIndex((c) => c.key === key);
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (idx < 0 || swap < 0 || swap >= sorted.length) return prev;
      const reordered = [...sorted];
      [reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]];
      const next = reordered.map((c, i) => ({ ...c, order: i }));
      issuesApi.saveColumns(projectId, next).catch(() => setColumns(prev));
      return next;
    });
  }, [projectId]);

  return { columns, addColumn, renameColumn, removeColumn, moveColumn };
}
