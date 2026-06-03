import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
              aria-label={t('wbs:row.moveAria', { name: item.name })}
              title={reorderDisabled ? t('wbs:row.reorderDisabledTitle') : t('wbs:row.reorderTitle')}
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical size={14} />
            </button>
            {hasChildren ? (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-muted hover:text-primary transition-colors"
                aria-label={expanded ? t('wbs:row.collapseAria', { name: item.name }) : t('wbs:row.expandAria', { name: item.name })}
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
                title={t('wbs:row.relatedIssuesTitle')}
                aria-label={t('wbs:row.relatedIssuesAria', { count: linkCount })}
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
                title={t('wbs:row.sourceChangelogTitle')}
                aria-label={t('wbs:row.sourceChangelogAria', { count: sourceCount })}
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
          title={startIsComputed ? t('wbs:row.computedStartTitle') : undefined}
        >
          {showStart?.slice(0, 10)}
        </td>
        <td
          className={`py-2 px-3 text-xs whitespace-nowrap ${endIsComputed ? 'text-muted opacity-60 italic' : 'text-muted'}`}
          title={endIsComputed ? t('wbs:row.computedEndTitle') : undefined}
        >
          {showEnd?.slice(0, 10)}
        </td>
        {/* 하위 항목이 있는 부모 행은 그루핑 역할 — 중요도·상태는 빈 셀로(자식 값으로 흐려지지 않게). */}
        <td className="py-2 px-3 whitespace-nowrap">
          {!hasChildren && <Badge variant={importance.variant} size="sm">{t(importance.labelKey)}</Badge>}
        </td>
        <td className="py-2 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          {!hasChildren && (
            <BadgeMenu<WbsStatus>
              value={item.status}
              options={[
                { value: 'Planned',    label: t('status:wbs.Planned'),    variant: 'neutral' },
                { value: 'InProgress', label: t('status:wbs.InProgress'), variant: 'warning' },
                { value: 'Done',       label: t('status:wbs.Done'),       variant: 'success' },
              ]}
              onChange={(next) => onStatusChange(item, next)}
              title={t('wbs:row.statusChange')}
            />
          )}
        </td>
        <td className="py-2 px-3 whitespace-nowrap">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onAddChild(item.id)}
              title={t('wbs:row.addChildTitle')}
              aria-label={t('wbs:row.addChildAria', { name: item.name })}
              className="p-1 text-muted hover:text-primary transition-colors"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={() => onEdit(item)}
              title={t('common:edit')}
              aria-label={t('wbs:row.editAria', { name: item.name })}
              className="p-1 text-muted hover:text-primary transition-colors"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              title={t('common:delete')}
              aria-label={t('wbs:row.deleteAria', { name: item.name })}
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
