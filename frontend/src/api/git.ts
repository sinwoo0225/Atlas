import { api } from './client';

export interface GitStatus {
  configured: boolean;        // 업무 정보 항목에 저장소 경로가 설정됐는지
  repoPath: string | null;
  isValidRepo: boolean;       // 경로가 실제 git 저장소인지
  currentBranch: string | null;
  hasUpstream: boolean;       // 추적 중인 원격 브랜치(@{upstream}) 존재
  ahead: number;              // 원격에 아직 안 보낸 커밋 수
  behind: number;             // 원격에 있으나 안 받은 커밋 수
  isDirty: boolean;           // 워킹 트리에 미커밋 변경 존재
  error: string | null;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  parents: string[];          // 부모 해시 (머지면 2개 이상) — DAG 레인 배치용
  author: string;
  authorEmail: string;
  date: string;               // ISO (UTC)
  subject: string;
  refs: string[];             // 브랜치/태그 라벨 ("main", "origin/main", "tag: v1.0")
  onRemote: boolean;          // 원격에 push 됨 (false 면 미push — 하이라이트)
}

export interface GitLog {
  commits: GitCommit[];
  hasMore: boolean;
}

export interface GitValidateResult {
  valid: boolean;
  error: string | null;
}

// git 이력은 'GitRepo' 타입 업무 정보(DevInfo) 항목에 종속 — 한 프로젝트에 저장소를 여러 개 둘 수 있다.
// status/log 는 (projectId, devInfoId) 로 항목을 특정, validate 는 저장 전 경로 검증(아직 항목 없음).
export const gitApi = {
  getStatus: (projectId: number, devInfoId: number) =>
    api.get<GitStatus>(`/projects/${projectId}/devinfo/${devInfoId}/git/status`),
  getLog: (projectId: number, devInfoId: number, opts?: { limit?: number; skip?: number; all?: boolean }) => {
    const q = new URLSearchParams();
    if (opts?.limit != null) q.set('limit', String(opts.limit));
    if (opts?.skip != null) q.set('skip', String(opts.skip));
    if (opts?.all != null) q.set('all', String(opts.all));
    const qs = q.toString();
    return api.get<GitLog>(`/projects/${projectId}/devinfo/${devInfoId}/git/log${qs ? `?${qs}` : ''}`);
  },
  validate: (projectId: number, path: string) =>
    api.get<GitValidateResult>(`/projects/${projectId}/devinfo/git/validate?path=${encodeURIComponent(path)}`),
};
