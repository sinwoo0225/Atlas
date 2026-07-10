import { type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, Pencil, X, Diamond, ChevronDown, ChevronRight,
  Link as LinkIcon, FileText, GripVertical, ListChecks,
} from 'lucide-react';
import { Badge, BadgeMenu } from '../../components/ui';
import { wbsImportanceBadge } from '../../utils/statusMaps';
import { spanOf, toIsoDate, isOverdueToStart } from '../../utils/wbsSpan';
import type { WbsItem, WbsStatus } from '../../types';

interface Props {
  item: WbsItem;
  projectId: number;
  depth?: number;
  matchedIds?: Set<number>;
  // 필터 활성 시 비매칭 행을 흐리게(하이라이트 대신 비대상 dim). 매칭 색은 더 이상 칠하지 않는다.
  filterActive?: boolean;
  // 멀티선택 부모 이동 — selectedIds=직접 선택, affectedIds=선택+자손(함께 이동, 강조).
  selectedIds?: Set<number>;
  affectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  // 접기/펼치기 — WbsPage 소유(간트와 공유). collapsedIds 에 있으면 접힘.
  collapsedIds: Set<number>;
  onToggleCollapse: (id: number) => void;
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
  item, projectId, depth = 0, matchedIds, filterActive,
  selectedIds, affectedIds, onToggleSelect,
  collapsedIds, onToggleCollapse,
  linkCountByWbs, sourceCountByWbs, reorderDisabled,
  onEdit, onDelete, onAddChild, onStatusChange,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const linkCount = linkCountByWbs.get(item.id) ?? 0;
  const sourceCount = sourceCountByWbs[item.id] ?? 0;
  const expanded = !collapsedIds.has(item.id);
  const hasChildren = (item.children?.length ?? 0) > 0;
  const importance = wbsImportanceBadge(item.importance);
  const isMatched = !!matchedIds && matchedIds.size > 0 && matchedIds.has(item.id);
  // 필터가 켜져 있고 이 행이 매칭이 아니면 흰 칠 대신 흐리게(저장 뷰에서도 잔상 없음).
  const dimmed = !!filterActive && !isMatched;
  const selected = !!selectedIds?.has(item.id);
  // 선택 본인 또는 선택의 자손 → 부모 이동 시 함께 옮겨지므로 강조(흐림보다 우선).
  const affected = !!affectedIds?.has(item.id);

  // 부모 행 날짜 fallback — 본인 값이 없으면 자손 합산 min/max 를 흐리게 표시.
  const computedSpan = hasChildren && (!item.startDate || !item.endDate)
    ? spanOf(item) : undefined;
  const showStart = item.startDate ?? (computedSpan?.start ? toIsoDate(computedSpan.start) : undefined);
  const showEnd   = item.endDate   ?? (computedSpan?.end   ? toIsoDate(computedSpan.end)   : undefined);
  const startIsComputed = !item.startDate && !!computedSpan?.start;
  const endIsComputed   = !item.endDate   && !!computedSpan?.end;

  // 제목 글자 — 굵기는 레벨(1레벨 강조), 색·취소선은 상태.
  // 완료(Done): item-done(흐림+또렷한 취소선) 공통 스타일.
  // 중단(Suspended): 종료(비완료) — 흐림(text-muted)만, 취소선은 없음(완료 아님).
  // 예정(Planned): 계획 시작일 전이면 흐림(text-muted), 계획 시작일이 지났는데 미착수면 진하게(착수 환기). 그 외: 레벨색.
  const overdueStart = isOverdueToStart(item);
  const levelColor = depth === 0 ? 'text-accent' : 'text-primary';
  const nameWeight = depth === 0 ? 'font-semibold' : '';
  const nameColor =
    item.status === 'Done'
      ? 'item-done'
      : item.status === 'Suspended'
        ? 'text-muted'
        : (item.status === 'Planned' || item.status === 'Waiting')
          ? (overdueStart ? levelColor : 'text-muted')
          : levelColor;

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
    // 인라인 opacity 가 Tailwind opacity 클래스보다 우선하므로 dim 도 여기서 처리. 이동 대상(affected)은 항상 또렷.
    opacity: isDragging ? 0.4 : affected ? 1 : dimmed ? 0.4 : 1,
  };

  return (
    <>
      <tr
        ref={setNodeRef}
        style={style}
        {...attributes}
        data-highlight-id={item.id}
        className={`border-b border-default hover:bg-surface-2 transition-colors ${affected ? 'bg-accent-soft' : ''}`}
        onDoubleClick={() => onEdit(item)}
      >
        <td className="py-2 px-4">
          <div className="flex items-center gap-1" style={{ paddingLeft: depth * 20 }}>
            {onToggleSelect && (
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect(item.id)}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 accent-accent cursor-pointer"
                aria-label={t('wbs:row.selectAria', { name: item.name })}
                title={t('wbs:row.selectTitle')}
              />
            )}
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
                onClick={() => onToggleCollapse(item.id)}
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
              className={`text-sm ${nameWeight} ${nameColor} hover:text-accent cursor-pointer transition-colors`}
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
            {(item.subtaskTotal ?? 0) > 0 && (
              <span
                className="ml-1 shrink-0"
                title={t('wbs:row.subtaskProgressTitle', { done: item.subtaskDone ?? 0, total: item.subtaskTotal })}
              >
                <Badge variant={(item.subtaskDone ?? 0) === item.subtaskTotal ? 'success' : 'neutral'} size="sm">
                  <ListChecks size={10} className="mr-0.5" /> {item.subtaskDone ?? 0}/{item.subtaskTotal}
                </Badge>
              </span>
            )}
          </div>
        </td>
        <td className="py-2 px-3 text-sm text-secondary whitespace-nowrap truncate max-w-[7rem]" title={hasChildren ? undefined : (item.assignee || undefined)}>{hasChildren ? '' : item.assignee}</td>
        <td
          className={`py-2 px-3 text-xs whitespace-nowrap ${startIsComputed ? 'text-muted opacity-60 italic' : overdueStart ? 'text-on-warning font-medium' : 'text-muted'}`}
          title={overdueStart ? t('wbs:row.overdueStartTitle') : startIsComputed ? t('wbs:row.computedStartTitle') : undefined}
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
                { value: 'Waiting',    label: t('status:wbs.Waiting'),    variant: 'info'    },
                { value: 'InProgress', label: t('status:wbs.InProgress'), variant: 'warning' },
                { value: 'Done',       label: t('status:wbs.Done'),       variant: 'success' },
                { value: 'Suspended',  label: t('status:wbs.Suspended'),  variant: 'neutral' },
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
              filterActive={filterActive}
              selectedIds={selectedIds}
              affectedIds={affectedIds}
              onToggleSelect={onToggleSelect}
              collapsedIds={collapsedIds}
              onToggleCollapse={onToggleCollapse}
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
