import { useCallback, useEffect, useMemo, useState } from 'react';
import { GitBranch, GitCommitHorizontal, ArrowUp, ArrowDown, AlertCircle, FolderGit2, Tag, Cloud } from 'lucide-react';
import { gitApi, type GitStatus, type GitCommit } from '../api/git';
import { getConnectionConfig, type ConnectionMode } from '../utils/hostBridge';
import { relativeTime } from '../utils/activity';
import { Button, Card, Badge, EmptyState, Skeleton } from './ui';

const PAGE = 200;

// ── 그래프(DAG) 레인 배치 ──────────────────────────────────────────────
// 커밋을 최신순으로 훑으며 각 커밋에 열(lane)을 배정한다. lanes[c] = 그 열이 아래로
// 내려가며 기다리는 부모 해시. 자식이 부모를 같은 열에 이어붙이고, 머지(부모 2개+)는
// 추가 열을 빌린다. 같은 부모를 기다리는 자식들은 indexOf 재사용으로 한 열로 수렴한다.
const LANE_COLORS = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb923c', '#22d3ee', '#f87171'];
const colorOf = (col: number) => LANE_COLORS[col % LANE_COLORS.length];

interface GraphEdge { from: number; to: number; color: string }
interface GraphRow { commit: GitCommit; col: number; edges: GraphEdge[] }

function buildGraph(commits: GitCommit[]): { rows: GraphRow[]; maxCol: number } {
  let lanes: (string | null)[] = [];
  const rows: GraphRow[] = [];
  let maxCol = 0;
  const firstFree = (arr: (string | null)[]) => {
    const i = arr.indexOf(null);
    return i === -1 ? arr.length : i;
  };

  for (const commit of commits) {
    const h = commit.hash;
    const myCols: number[] = [];
    lanes.forEach((v, c) => { if (v === h) myCols.push(c); });
    const nodeCol = myCols.length ? myCols[0] : firstFree(lanes);

    const below = lanes.slice();
    while (below.length <= nodeCol) below.push(null);
    for (const c of myCols) below[c] = null; // 들어오던 열들은 노드로 수렴
    below[nodeCol] = null;                    // 노드가 소비 — 부모가 다시 채움

    const parentCols: number[] = [];
    commit.parents.forEach((p, k) => {
      let pc = below.indexOf(p);
      if (pc === -1) {
        pc = k === 0 ? nodeCol : firstFree(below);
        while (below.length <= pc) below.push(null);
        below[pc] = p;
      }
      parentCols.push(pc);
    });

    const edges: GraphEdge[] = [];
    lanes.forEach((v, c) => { // 통과 레인 — 곧장 아래로
      if (v != null && v !== h) edges.push({ from: c, to: c, color: colorOf(c) });
    });
    for (const pc of parentCols) edges.push({ from: nodeCol, to: pc, color: colorOf(pc) });
    for (const c of myCols) if (c !== nodeCol) edges.push({ from: c, to: nodeCol, color: colorOf(nodeCol) });

    below.forEach((v, i) => { if (v != null) maxCol = Math.max(maxCol, i); });
    maxCol = Math.max(maxCol, nodeCol);
    rows.push({ commit, col: nodeCol, edges });
    lanes = below;
  }
  return { rows, maxCol };
}

const ROW_H = 64;
const LANE_W = 18;
const LEFT_PAD = 16;
const NODE_R = 5;
const xOf = (col: number) => LEFT_PAD + col * LANE_W;
const cyOf = (row: number) => row * ROW_H + ROW_H / 2;

function CommitGraph({ commits }: { commits: GitCommit[] }) {
  const { rows, maxCol } = useMemo(() => buildGraph(commits), [commits]);
  const graphW = LEFT_PAD * 2 + maxCol * LANE_W;
  const svgH = rows.length * ROW_H;

  return (
    <div className="flex">
      <svg
        width={graphW}
        height={svgH}
        className="shrink-0 overflow-visible"
        style={{ minWidth: graphW }}
        aria-hidden
      >
        {rows.map((r, i) =>
          r.edges.map((e, j) => {
            const x1 = xOf(e.from);
            const x2 = xOf(e.to);
            const y1 = cyOf(i);
            const y2 = cyOf(i + 1);
            const d = x1 === x2
              ? `M${x1},${y1} L${x2},${y2}`
              : `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`;
            return <path key={`e-${i}-${j}`} d={d} fill="none" stroke={e.color} strokeWidth={2} opacity={0.85} />;
          }),
        )}
        {rows.map((r, i) => {
          const cx = xOf(r.col);
          const cy = cyOf(i);
          const color = colorOf(r.col);
          // onRemote=false(미push) → 속 빈 원(테두리만)으로 강조.
          return r.commit.onRemote ? (
            <circle key={`n-${i}`} cx={cx} cy={cy} r={NODE_R} fill={color} stroke="var(--bg-surface)" strokeWidth={1.5} />
          ) : (
            <circle key={`n-${i}`} cx={cx} cy={cy} r={NODE_R} fill="var(--bg-surface)" stroke={color} strokeWidth={2.5} />
          );
        })}
      </svg>

      <div className="flex-1 min-w-0">
        {rows.map((r) => {
          const c = r.commit;
          return (
            <div
              key={c.hash}
              className="border-b border-default last:border-b-0 px-3 flex flex-col justify-center"
              style={{ height: ROW_H }}
            >
              <div className="flex items-center gap-2 min-w-0">
                {!c.onRemote && (
                  <Badge size="sm" variant="warning" className="shrink-0 flex items-center gap-1">
                    <Cloud size={11} /> 미push
                  </Badge>
                )}
                {c.refs.map((ref) => {
                  const isTag = ref.startsWith('tag: ');
                  const isRemote = ref.startsWith('origin/') || ref.includes('/');
                  return (
                    <Badge
                      key={ref}
                      size="sm"
                      variant={isTag ? 'accent' : isRemote ? 'neutral' : 'success'}
                      className="shrink-0 flex items-center gap-1 max-w-[12rem] truncate"
                      title={ref}
                    >
                      {isTag ? <Tag size={10} /> : <GitBranch size={10} />}
                      <span className="truncate">{isTag ? ref.slice(5) : ref}</span>
                    </Badge>
                  );
                })}
                <span className="text-sm text-primary truncate">{c.subject}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted mt-0.5 min-w-0">
                <code className="text-[11px] bg-surface-2 px-1 rounded shrink-0">{c.shortHash}</code>
                <span className="truncate">{c.author}</span>
                <span className="shrink-0">· {relativeTime(c.date)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 동기화 상태 바 ─────────────────────────────────────────────────────
function SyncBar({ status }: { status: GitStatus }) {
  return (
    <div className="flex items-center gap-3 flex-wrap text-sm">
      <span className="flex items-center gap-1.5 font-medium text-primary">
        <GitBranch size={15} className="text-accent" />
        {status.currentBranch ?? '(detached)'}
      </span>
      {status.hasUpstream ? (
        <span className="flex items-center gap-2 text-muted">
          {status.ahead > 0 && (
            <span className="flex items-center gap-0.5 text-on-warning" title="원격에 아직 push 하지 않은 커밋">
              <ArrowUp size={13} /> {status.ahead}
            </span>
          )}
          {status.behind > 0 && (
            <span className="flex items-center gap-0.5 text-accent" title="원격에 있으나 아직 받지(pull) 않은 커밋">
              <ArrowDown size={13} /> {status.behind}
            </span>
          )}
          {status.ahead === 0 && status.behind === 0 && (
            <span className="text-on-success">원격과 동기화됨</span>
          )}
        </span>
      ) : (
        <span className="text-xs text-muted">추적 중인 원격 브랜치 없음</span>
      )}
      {status.isDirty && (
        <Badge size="sm" variant="warning">커밋 안 한 변경 있음</Badge>
      )}
      {status.repoPath && (
        <span className="text-xs text-muted ml-auto truncate max-w-[24rem]" title={status.repoPath}>
          <FolderGit2 size={12} className="inline mr-1" />{status.repoPath}
        </span>
      )}
    </div>
  );
}

export function GitHistoryView({ projectId }: { projectId: number }) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [all, setAll] = useState(false);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('Local');

  useEffect(() => { getConnectionConfig().then((c) => { if (c) setConnectionMode(c.mode); }); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const st = await gitApi.getStatus(projectId);
      setStatus(st);
      if (st.configured && st.isValidRepo) {
        const lg = await gitApi.getLog(projectId, { limit: PAGE, all });
        setCommits(lg.commits);
        setHasMore(lg.hasMore);
      } else {
        setCommits([]);
        setHasMore(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Git 이력을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [projectId, all]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const lg = await gitApi.getLog(projectId, { limit: PAGE, skip: commits.length, all });
      setCommits((prev) => [...prev, ...lg.commits]);
      setHasMore(lg.hasMore);
    } catch { /* client.ts 토스트 처리 */ }
    finally { setLoadingMore(false); }
  };

  if (loading) {
    return (
      <Card padding="spacious">
        <Skeleton height={18} width="30%" />
        <div className="mt-4 space-y-2">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={36} />)}
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card padding="spacious">
        <EmptyState error={error} onRetry={load} />
      </Card>
    );
  }

  // 경로 미설정
  if (status && !status.configured) {
    return (
      <Card padding="spacious">
        <EmptyState
          icon={<FolderGit2 size={36} />}
          title="연결된 Git 저장소가 없습니다."
          description="프로젝트 목록에서 이 프로젝트를 수정해 'Git 저장소 경로'에 .git 이 있는 소스코드 폴더를 지정하세요."
        />
      </Card>
    );
  }

  // 경로는 있으나 유효하지 않음 (git 미설치 / .git 없음 / Client 모드에서 서버에 경로 없음)
  if (status && !status.isValidRepo) {
    return (
      <Card padding="spacious">
        <div className="flex items-start gap-2 text-sm text-on-danger">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Git 저장소를 읽을 수 없습니다.</p>
            {status.error && <p className="text-muted mt-1">{status.error}</p>}
            {status.repoPath && <p className="text-muted mt-1 text-xs">경로: {status.repoPath}</p>}
            {connectionMode === 'Client' && (
              <p className="text-muted mt-2 text-xs">
                Client 모드에서는 서버 머신 기준 경로여야 합니다. Git 이력은 Local 모드에서 사용하세요.
              </p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {status && (
        <Card padding="normal">
          <SyncBar status={status} />
        </Card>
      )}

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-muted cursor-pointer select-none">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          모든 브랜치 표시
        </label>
        <span className="text-xs text-muted ml-auto">{commits.length}개 커밋</span>
      </div>

      {commits.length === 0 ? (
        <Card padding="spacious">
          <EmptyState icon={<GitCommitHorizontal size={36} />} title="커밋이 없습니다." description="이 저장소에 아직 커밋이 없습니다." />
        </Card>
      ) : (
        <Card padding="none" className="overflow-x-auto">
          <CommitGraph commits={commits} />
        </Card>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? '불러오는 중…' : '더 보기'}
          </Button>
        </div>
      )}
    </div>
  );
}
