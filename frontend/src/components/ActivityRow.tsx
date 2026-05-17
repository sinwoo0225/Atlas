import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { diffLines } from 'diff';
import { Badge } from './ui';
import { ACTIVITY_TYPE_META, ACTION_META, relativeTime, activityUrl } from '../utils/activity';
import { useProjectColor } from '../utils/projectColor';
import type { ActivityLog } from '../types';

// 활동 1개 행. Dashboard "최근 활동" 위젯 + 전역 /activity 페이지 양쪽에서 재사용.
// 변경 필드 (changedFields) 가 있으면 우측에 chevron + "N개 변경" 라벨, 클릭 시 행 아래에 필드별 old→new.
// 단일 라인 필드 = 기존 3열 표 (이전 / 이후). multiline 필드 (\n 포함) = diffLines git-style +/− 다이프.
// 행 본문 클릭 = entity 페이지 이동. chevron 만 stopPropagation 으로 확장 토글.
export function ActivityRow({ activity, showProject = false }: { activity: ActivityLog; showProject?: boolean }) {
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
        {showProject && activity.projectName && activity.projectId != null && (
          <ProjectChip
            projectId={activity.projectId}
            projectName={activity.projectName}
            onNavigate={() => navigate(`/projects/${activity.projectId}/dashboard`)}
          />
        )}
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
        <div className="pb-2 pl-6 pr-2 -mt-1 space-y-2" onClick={(e) => e.stopPropagation()}>
          {changedEntries.map(([field, val]) => (
            <FieldDiff key={field} field={field} oldText={val.old} newText={val.new} />
          ))}
        </div>
      )}
    </div>
  );
}

function isMultiline(s: string): boolean {
  return typeof s === 'string' && s.includes('\n');
}

function FieldDiff({ field, oldText, newText }: { field: string; oldText: string; newText: string }) {
  const multiline = isMultiline(oldText) || isMultiline(newText);
  if (multiline) {
    return (
      <div>
        <div className="text-xs text-secondary font-medium mb-1">{field}</div>
        <MultilineDiff oldText={oldText} newText={newText} />
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 text-xs">
      <div className="text-secondary font-medium w-32 shrink-0 truncate" title={field}>{field}</div>
      <code className="bg-surface-3 px-1 py-0.5 rounded text-muted break-all flex-1 min-w-0">{oldText || '∅'}</code>
      <code className="bg-surface-3 px-1 py-0.5 rounded text-secondary break-all flex-1 min-w-0">{newText || '∅'}</code>
    </div>
  );
}

function MultilineDiff({ oldText, newText }: { oldText: string; newText: string }) {
  const parts = useMemo(() => diffLines(oldText ?? '', newText ?? ''), [oldText, newText]);
  return (
    <pre className="text-xs font-mono bg-surface-3 rounded p-2 max-h-64 overflow-auto whitespace-pre-wrap break-all">
      {parts.flatMap((part, i) => {
        const lines = part.value.split('\n');
        // diffLines 가 trailing newline 으로 빈 줄을 추가하기도 — 마지막 빈 줄만 제거.
        if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
        return lines.map((line, j) => {
          const prefix = part.added ? '+' : part.removed ? '−' : ' ';
          const cls = part.added
            ? 'bg-success-soft text-on-success'
            : part.removed
              ? 'bg-danger-soft text-on-danger'
              : 'text-muted';
          // 200자 초과 줄은 가독성 위해 잘라 표시. 원본 데이터는 그대로.
          const displayLine = line.length > 200 ? line.slice(0, 200) + '…' : line;
          return (
            <div key={`${i}-${j}`} className={`${cls} px-1`}>
              <span className="select-none opacity-50 mr-1">{prefix}</span>
              {displayLine || ' '}
            </div>
          );
        });
      })}
    </pre>
  );
}

// 프로젝트 컬러 칩 — 같은 프로젝트 id 는 항상 같은 색/글리프 (8색 hash).
// 색맹 보조로 글리프(●■▲...) 를 색과 1:1 페어링. 클릭 시 프로젝트 대시보드 이동.
function ProjectChip({
  projectId, projectName, onNavigate,
}: { projectId: number; projectName: string; onNavigate: () => void }) {
  const { bg, text, glyph } = useProjectColor(projectId);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onNavigate(); }}
      style={{ backgroundColor: bg, color: text }}
      className="shrink-0 max-w-[140px] inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium hover:opacity-80 transition-opacity"
      title={projectName}
    >
      <span aria-hidden className="text-[10px] leading-none">{glyph}</span>
      <span className="truncate">{projectName}</span>
    </button>
  );
}
