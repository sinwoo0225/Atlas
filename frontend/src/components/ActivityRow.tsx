import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Badge } from './ui';
import { ACTIVITY_TYPE_META, ACTION_META, relativeTime, activityUrl } from '../utils/activity';
import type { ActivityLog } from '../types';

// 활동 1개 행. Dashboard "최근 활동" 위젯 + 전역 /activity 페이지 양쪽에서 재사용.
// 변경 필드 (changedFields) 가 있으면 우측에 chevron + "N개 변경" 라벨, 클릭 시 행 아래에 필드별 old→new 표.
// 행 본문 클릭 = entity 페이지 이동. chevron 만 stopPropagation 으로 확장 토글.
export function ActivityRow({ activity }: { activity: ActivityLog }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const meta = ACTIVITY_TYPE_META[activity.entityType];
  const action = ACTION_META[activity.action];
  const url = activityUrl(activity);
  const Icon = meta.Icon;

  const changedEntries = activity.changedFields ? Object.entries(activity.changedFields) : [];
  const hasChanges = changedEntries.length > 0;

  return (
    <div className={url ? 'cursor-pointer hover:bg-surface-2 px-2 -mx-2 rounded transition-colors' : 'px-2 -mx-2'}>
      <div
        onClick={url ? () => navigate(url) : undefined}
        className="flex items-center gap-2 py-1.5 border-b border-default last:border-0"
      >
        <Icon size={14} className="text-muted shrink-0" />
        <span className="text-xs text-muted shrink-0 w-12">{meta.label}</span>
        <Badge variant={action.variant} size="sm">{action.label}</Badge>
        <span className="text-sm text-secondary truncate flex-1 min-w-0">{activity.entityTitle || `#${activity.entityId}`}</span>
        {hasChanges && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            className="text-xs text-muted hover:text-secondary shrink-0 flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-surface-3"
            title={expanded ? '필드 변경 닫기' : '필드 변경 보기'}
          >
            <ChevronRight
              size={12}
              className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
            />
            <span>{changedEntries.length}개 변경</span>
          </button>
        )}
        {activity.actor && <span className="text-xs text-muted shrink-0">{activity.actor}</span>}
        <span className="text-xs text-muted shrink-0 w-16 text-right">{relativeTime(activity.timestamp)}</span>
      </div>
      {expanded && hasChanges && (
        <div className="pb-2 pl-6 pr-2 -mt-1">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-muted">
                <th className="text-left font-normal py-1 pr-3 w-32">필드</th>
                <th className="text-left font-normal py-1 pr-3">이전</th>
                <th className="text-left font-normal py-1">이후</th>
              </tr>
            </thead>
            <tbody>
              {changedEntries.map(([field, val]) => (
                <tr key={field} className="align-top">
                  <td className="py-1 pr-3 text-secondary font-medium">{field}</td>
                  <td className="py-1 pr-3 text-muted break-all"><code className="bg-surface-3 px-1 py-0.5 rounded">{val.old || '∅'}</code></td>
                  <td className="py-1 text-secondary break-all"><code className="bg-surface-3 px-1 py-0.5 rounded">{val.new || '∅'}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
