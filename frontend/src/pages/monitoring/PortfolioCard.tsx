import { LayoutGrid } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, Badge, Skeleton, EmptyState } from '../../components/ui';
import type { PortfolioRollup } from '../../types';

interface Props {
  data: PortfolioRollup | null;
  loading: boolean;
  className?: string;
}

// 카테고리별 포트폴리오 롤업 — 프로젝트수·WBS진척·미결이슈·자원수요·위험을 한 행으로. 관리자 한눈 뷰.
export function PortfolioCard({ data, loading, className = '' }: Props) {
  const { t } = useTranslation();
  return (
    <Card padding="normal" className={className}>
      <h3 className="h-card flex items-center gap-2 mb-2">
        <LayoutGrid size={16} className="text-muted" />
        {t('monitoring:portfolio.title')}
      </h3>
      {loading || !data ? (
        <Skeleton height={180} />
      ) : data.rows.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: 120 }}>
          <EmptyState icon={<LayoutGrid size={28} />} title={t('monitoring:portfolio.empty')} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted border-b border-default">
                <th className="text-left py-1.5 font-medium">{t('monitoring:portfolio.category')}</th>
                <th className="text-right font-medium px-2">{t('monitoring:portfolio.projects')}</th>
                <th className="text-left font-medium px-2 w-[30%]">{t('monitoring:portfolio.progress')}</th>
                <th className="text-right font-medium px-2">{t('monitoring:portfolio.openIssues')}</th>
                <th className="text-right font-medium px-2">{t('monitoring:portfolio.demand')}</th>
                <th className="text-right font-medium pl-2">{t('monitoring:portfolio.atRisk')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.category || '__none'} className="border-b border-default/50">
                  <td className="py-2 text-primary truncate max-w-[10rem]">{r.category || t('monitoring:portfolio.uncategorized')}</td>
                  <td className="text-right text-secondary px-2">{r.projectCount}</td>
                  <td className="px-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-surface-3 rounded overflow-hidden">
                        <div className="h-full bg-accent rounded" style={{ width: `${r.wbsProgressPercent}%` }} />
                      </div>
                      <span className="text-xs text-muted w-9 text-right shrink-0">{r.wbsProgressPercent}%</span>
                    </div>
                  </td>
                  <td className="text-right text-secondary px-2">{r.openIssues}</td>
                  <td className="text-right text-secondary px-2">{r.demandHours > 0 ? `${r.demandHours}h` : '—'}</td>
                  <td className="text-right pl-2">
                    {r.atRisk > 0 ? <Badge variant="danger" size="sm">{r.atRisk}</Badge> : <span className="text-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
