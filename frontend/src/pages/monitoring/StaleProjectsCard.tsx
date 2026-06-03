import { useNavigate } from 'react-router-dom';
import { MoonStar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, Badge, Skeleton, EmptyState } from '../../components/ui';
import { projectStatusBadge } from '../../utils/statusMaps';
import type { StaleProject } from '../../types';

// 개요 그리드의 차트 카드(280px 차트)와 본문 높이를 맞춰 데이터 유무와 무관하게 카드 높이 통일.
const BODY_H = 280;

// 방치된 프로젝트 — 활성(진행중/대기)인데 최근 활동이 오래 없는 프로젝트. 경과일 큰 순.
// 경과 ≥21일은 위험(danger), 그 외 주의(warning) 톤.
export function StaleProjectsCard({ data, loading }: { data: StaleProject[]; loading: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Card padding="normal">
      <h3 className="h-card flex items-center gap-2 mb-2">
        <MoonStar size={16} className="text-muted" />
        방치된 프로젝트
        {data.length > 0 && <span className="text-xs font-normal text-muted">({data.length})</span>}
      </h3>
      <div style={{ height: BODY_H }}>
      {loading ? (
        <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={44} />)}</div>
      ) : data.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <EmptyState icon={<MoonStar size={28} />} title="방치된 프로젝트 없음" description="활성 프로젝트가 최근 모두 업데이트됨" />
        </div>
      ) : (
        <ul className="h-full space-y-2 overflow-y-auto pr-1">
          {data.map((p) => {
            const badge = projectStatusBadge[p.status];
            const crit = p.daysSince >= 21;
            return (
              <li key={p.projectId}>
                <button
                  type="button"
                  onClick={() => navigate(`/projects/${p.projectId}/dashboard`)}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-md bg-surface-2 border border-default hover:bg-surface-3 transition-colors"
                >
                  <Badge variant={badge.variant} size="sm">{t(badge.labelKey)}</Badge>
                  <span className="text-sm text-primary truncate flex-1 min-w-0">{p.projectName}</span>
                  <span className="text-[11px] text-muted shrink-0 hidden sm:inline">
                    {p.lastActivity ? `${p.lastActivity}` : '활동 기록 없음'}
                  </span>
                  <span
                    className={`text-xs font-semibold shrink-0 px-2 py-0.5 rounded-full tabular-nums ${
                      crit ? 'bg-danger-soft text-on-danger' : 'bg-warning-soft text-on-warning'
                    }`}
                  >
                    {p.daysSince}일
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </Card>
  );
}
