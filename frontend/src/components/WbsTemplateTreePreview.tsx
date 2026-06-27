import { CornerDownRight, Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from './ui';
import type { WbsTemplateNode } from '../types';

// 템플릿 적용 시 '등록될 작업명(계층)' 을 읽기전용 텍스트로 보여주는 미리보기.
// 작업명을 주 텍스트로, 담당(역할)·기간·마일스톤·중요도는 보조 칩/뮤트로 — disabled input 미사용.
// 피커(적용 전)와 템플릿 보기 모달에서 공용.
function PreviewNode({ node, depth }: { node: WbsTemplateNode; depth: number }) {
  const { t } = useTranslation();
  const hasOffset = node.offsetStartDays != null;
  const hasDuration = node.durationDays != null;
  return (
    <div>
      <div className="flex items-center gap-2 py-1 min-w-0" style={{ paddingLeft: depth * 18 }}>
        {depth > 0 && <CornerDownRight size={13} className="text-muted shrink-0" />}
        {node.isMilestone && <Flag size={13} className="text-accent shrink-0" />}
        <span className={`text-sm truncate ${depth === 0 ? 'font-medium text-primary' : 'text-secondary'}`}>
          {node.name || t('templates:preview.untitled')}
        </span>
        {node.assignee && <Badge size="sm" variant="neutral">{node.assignee}</Badge>}
        {node.importance === 3 && <Badge size="sm" variant="accent">{t('status:importance.High')}</Badge>}
        {(hasOffset || hasDuration) && (
          <span className="text-[11px] text-muted shrink-0 tabular-nums">
            {hasOffset ? `D+${node.offsetStartDays}` : ''}
            {hasDuration ? `${hasOffset ? ' · ' : ''}${t('templates:preview.days', { count: node.durationDays })}` : ''}
          </span>
        )}
      </div>
      {node.children.map((c, i) => (
        <PreviewNode key={i} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}

export function WbsTemplateTreePreview({ nodes }: { nodes: WbsTemplateNode[] }) {
  const { t } = useTranslation();
  if (nodes.length === 0) {
    return <p className="text-sm text-muted">{t('templates:preview.empty')}</p>;
  }
  return (
    <div>
      {nodes.map((n, i) => (
        <PreviewNode key={i} node={n} depth={0} />
      ))}
    </div>
  );
}
