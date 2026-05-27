import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, Pencil, X, Diamond, ChevronDown, ChevronRight,
  Link as LinkIcon, FileText, GripVertical,
} from 'lucide-react';
import { Badge, BadgeMenu } from '../../components/ui';
import { wbsImportanceBadge } from '../../utils/statusMaps';
import { spanOf, toIsoDate } from '../../utils/wbsSpan';
import type { WbsItem, WbsStatus } from '../../types';

interface Props {
  item: WbsItem;
  projectId: number;
  depth?: number;
  matchedIds?: Set<number>;
  linkCountByWbs: Map<number, number>;
  sourceCountByWbs: Record<number, number>;
  reorderDisabled: boolean;
  onEdit: (item: WbsItem) => void;
  onDelete: (id: number) => void;
  onAddChild: (parentId: number) => void;
  onStatusChange: (item: WbsItem, status: WbsStatus) => void;
}

// 사이클 13 — 기존 인라인 WbsRow 의 useSortable 통합 버전.
// drag handle (GripVertical) 만 listeners 받아 status BadgeMenu / 액션 버튼 클릭과 분리.
// children 재귀 시 부모마다 SortableContext 발급 → 같은 부모 형제 안에서만 정렬.
export function SortableWbsRow({
  item, projectId, depth = 0, matchedIds,
  linkCountByWbs, sourceCountByWbs, reorderDisabled,
  onEdit, onDelete, onAddChild, onStatusChange,
}: Props) {
  const navigate = useNavigate();
  const linkCount = linkCountByWbs.get(item.id) ?? 0;
  const sourceCount = sourceCountByWbs[item.id] ?? 0;
  const [expanded, setExpanded] = useState(true);
  const hasChildren = (item.children?.length ?? 0) > 0;
  const importance = wbsImportanceBadge(item.importance);
  const isMatched = matchedIds && matchedIds.size > 0 && matchedIds.has(item.id);

  // 부모 행 날짜 fallback — 본인 값이 없으면 자손 합산 min/max 를 흐리게 표시.
  const computedSpan = hasChildren && (!item.startDate || !item.endDate)
    ? spanOf(item) : undefined;
  const showStart = item.startDate ?? (computedSpan?.start ? toIsoDate(computedSpan.start) : undefined);
  const showEnd   = item.endDate   ?? (computedSpan?.end   ? toIsoDate(computedSpan.end)   : undefined);
  const startIsComputed = !item.startDate && !!computedSpan?.start;
  const endIsComputed   = !item.endDate   && !!computedSpan?.end;

  // 제목 글자 — 굵기는 레벨(1레벨 강조), 색·취소선은 상태(완료/예정 흐리게, 완료 취소선).
  const nameWeight = depth === 0 ? 'font-semibold' : '';
  const nameColor =
    item.status === 'Done' || item.status === 'Planned'
      ? 'text-muted'
      : depth === 0
        ? 'text-accent'
        : 'text-primary';
  const nameDecoration = item.status === 'Done' ? 'line-through' : '';

  const {
    attributes, listeners,
    setNodeRef, setActivatorNodeRef,
    transform, transition, isDragging,
  } = useSortable({
    id: item.id,
    data: { parentId: item.parentId ?? null, depth },
    disabled: reorderDisabled,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <>
      <tr
        ref={setNodeRef}
        style={style}
        {...attributes}
        data-highlight-id={item.id}
        className={`border-b border-default hover:bg-surface-2 transition-colors ${isMatched ? 'bg-accent-soft' : ''}`}
        onDoubleClick={() => onEdit(item)}
      >
        <td className="py-2 px-4">
          <div className="flex items-center gap-1" style={{ paddingLeft: depth * 20 }}>
            <button
              ref={setActivatorNodeRef}
              {...listeners}
              type="button"
              disabled={reorderDisabled}
              className={`p-0.5 text-muted transition-colors ${
                reorderDisabled
                  ? 'opacity-30 cursor-not-allowed'
                  : 'hover:text-primary cursor-grab active:cursor-grabbing'
              }`}
              aria-label={`${item.name} 행 이동 (Space 로 잡고 화살표로 이동)`}
              title={reorderDisabled ? '필터를 해제하면 순서를 변경할 수 있습니다.' : '드래그하여 순서 변경'}
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical size={14} />
            </button>
            {hasChildren ? (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-muted hover:text-primary transition-colors"
                aria-label={expanded ? `${item.name} 접기` : `${item.name} 펼치기`}
                aria-expanded={expanded}
              >
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            ) : (
              <span className="w-4 inline-block" />
            )}
            {item.isMilestone && <Diamond size={12} className="text-accent" />}
            <span
              className={`text-sm ${nameWeight} ${nameColor} ${nameDecoration} hover:text-accent cursor-pointer transition-colors`}
              onClick={() => onEdit(item)}
            >
              {item.name}
            </span>
            {linkCount > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                className="ml-1 shrink-0"
                title="관련 Issue 보기"
                aria-label={`관련 Issue ${linkCount}건 보기`}
              >
                <Badge variant="neutral" size="sm" className="cursor-pointer hover:bg-accent-soft hover:text-accent transition-colors">
                  <LinkIcon size={10} className="mr-0.5" /> {linkCount}
                </Badge>
              </button>
            )}
            {sourceCount > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); navigate(`/projects/${projectId}/changelogs?sourceWbs=${item.id}`); }}
                className="ml-1 shrink-0"
                title="이 작업이 출처인 변경이력 보기"
                aria-label={`출처 변경이력 ${sourceCount}건 보기`}
              >
                <Badge variant="info" size="sm" className="cursor-pointer hover:bg-accent-soft hover:text-accent transition-colors">
                  <FileText size={10} className="mr-0.5" /> {sourceCount}
                </Badge>
              </button>
            )}
          </div>
        </td>
        <td className="py-2 px-3 text-sm text-secondary whitespace-nowrap truncate max-w-[7rem]" title={hasChildren ? undefined : (item.assignee || undefined)}>{hasChildren ? '' : item.assignee}</td>
        <td
          className={`py-2 px-3 text-xs whitespace-nowrap ${startIsComputed ? 'text-muted opacity-60 italic' : 'text-muted'}`}
          title={startIsComputed ? '자식 작업에서 계산된 시작일' : undefined}
        >
          {showStart?.slice(0, 10)}
        </td>
        <td
          className={`py-2 px-3 text-xs whitespace-nowrap ${endIsComputed ? 'text-muted opacity-60 italic' : 'text-muted'}`}
          title={endIsComputed ? '자식 작업에서 계산된 종료일' : undefined}
        >
          {showEnd?.slice(0, 10)}
        </td>
        {/* 하위 항목이 있는 부모 행은 그루핑 역할 — 중요도·상태는 빈 셀로(자식 값으로 흐려지지 않게). */}
        <td className="py-2 px-3 whitespace-nowrap">
          {!hasChildren && <Badge variant={importance.variant} size="sm">{importance.label}</Badge>}
        </td>
        <td className="py-2 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          {!hasChildren && (
            <BadgeMenu<WbsStatus>
              value={item.status}
              options={[
                { value: 'Planned',    label: '예정', variant: 'neutral' },
                { value: 'InProgress', label: '진행', variant: 'warning' },
                { value: 'Done',       label: '완료', variant: 'success' },
              ]}
              onChange={(next) => onStatusChange(item, next)}
              title="상태 변경"
            />
          )}
        </td>
        <td className="py-2 px-3 whitespace-nowrap">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onAddChild(item.id)}
              title="하위 작업 추가"
              aria-label={`${item.name} 의 하위 작업 추가`}
              className="p-1 text-muted hover:text-primary transition-colors"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={() => onEdit(item)}
              title="수정"
              aria-label={`${item.name} 수정`}
              className="p-1 text-muted hover:text-primary transition-colors"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              title="삭제"
              aria-label={`${item.name} 삭제`}
              className="p-1 text-on-danger hover:opacity-80 transition-opacity"
            >
              <X size={14} />
            </button>
          </div>
        </td>
      </tr>
      {expanded && hasChildren && (
        <SortableContext
          items={item.children!.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {item.children!.map((child) => (
            <SortableWbsRow
              key={child.id}
              item={child}
              projectId={projectId}
              depth={depth + 1}
              matchedIds={matchedIds}
              linkCountByWbs={linkCountByWbs}
              sourceCountByWbs={sourceCountByWbs}
              reorderDisabled={reorderDisabled}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onStatusChange={onStatusChange}
            />
          ))}
        </SortableContext>
      )}
    </>
  );
}
