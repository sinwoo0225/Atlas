import { type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, Pencil, X, Diamond, ChevronDown, ChevronRight,
  Link as LinkIcon, FileText, GripVertical, ListChecks,
  FolderTree, AlertTriangle,
} from 'lucide-react';
import { Badge, BadgeMenu } from '../../components/ui';
import { wbsImportanceBadge, wbsStatusBadge } from '../../utils/statusMaps';
import { spanOf, toIsoDate, isOverdueToStart } from '../../utils/wbsSpan';
import { isGroupWbs, effectiveWbsStatus } from '../../utils/wbsHelpers';
import { wbsProgressOf } from '../../utils/wbsProgress';
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
  // 역할 토글 — 작업 ⇄ 그룹. 그룹은 모든 지표에서 빠지므로 되돌릴 수 있어야 한다.
  onToggleKind: (item: WbsItem) => void;
}

// 사이클 13 — 기존 인라인 WbsRow 의 useSortable 통합 버전.
// drag handle (GripVertical) 만 listeners 받아 status BadgeMenu / 액션 버튼 클릭과 분리.
// children 재귀 시 부모마다 SortableContext 발급 → 같은 부모 형제 안에서만 정렬.
export function SortableWbsRow({
  item, projectId, depth = 0, matchedIds, filterActive,
  selectedIds, affectedIds, onToggleSelect,
  collapsedIds, onToggleCollapse,
  linkCountByWbs, sourceCountByWbs, reorderDisabled,
  onEdit, onDelete, onAddChild, onStatusChange, onToggleKind,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const linkCount = linkCountByWbs.get(item.id) ?? 0;
  const sourceCount = sourceCountByWbs[item.id] ?? 0;
  const expanded = !collapsedIds.has(item.id);
  // 두 축을 구분한다 — 구조(hasChildren)와 역할(isGroup)은 별개다.
  //   구조: 접기 chevron, 들여쓰기, 재귀 렌더. 자식이 있는 Task(상위 작업)도 접을 수 있어야 한다.
  //   역할: 상태 배지 편집 가능 여부, 담당자·중요도 셀, 지표 포함 여부. 자식이 없는 Group(빈 그룹)도 성립한다.
  const hasChildren = (item.children?.length ?? 0) > 0;
  const isGroup = isGroupWbs(item);
  // 그룹은 자기 status 가 아니라 자손에서 파생한 상태로 표시한다. 도입 전에는 부모의 자기 status 를 그대로 써서
  // 자식이 전부 완료돼도 부모가 'Planned' 로 남아 흐리게 표시됐다.
  const effStatus = effectiveWbsStatus(item);
  const progress = wbsProgressOf(item);
  const importance = wbsImportanceBadge(item.importance);
  const isMatched = !!matchedIds && matchedIds.size > 0 && matchedIds.has(item.id);
  // 필터가 켜져 있고 이 행이 매칭이 아니면 흰 칠 대신 흐리게(저장 뷰에서도 잔상 없음).
  const dimmed = !!filterActive && !isMatched;
  const selected = !!selectedIds?.has(item.id);
  // 선택 본인 또는 선택의 자손 → 부모 이동 시 함께 옮겨지므로 강조(흐림보다 우선).
  const affected = !!affectedIds?.has(item.id);

  // 부모 행 날짜 fallback — 본인 값이 없으면 자손 합산 min/max 를 흐리게 표시.
  // 서버가 rollupStart/End 를 내려주지만(트리 조회에서만) 낙관적 갱신 직후엔 비어 있을 수 있어 spanOf 로 폴백.
  const localSpan = hasChildren && (!item.startDate || !item.endDate) ? spanOf(item) : undefined;
  const rollupStart = item.rollupStart
    ?? (localSpan?.start !== undefined ? toIsoDate(localSpan.start) : undefined);
  const rollupEnd = item.rollupEnd
    ?? (localSpan?.end !== undefined ? toIsoDate(localSpan.end) : undefined);
  const showStart = item.startDate ?? rollupStart ?? undefined;
  const showEnd   = item.endDate   ?? rollupEnd   ?? undefined;
  const startIsComputed = !item.startDate && !!rollupStart;
  const endIsComputed   = !item.endDate   && !!rollupEnd;

  // 제목 글자 — 굵기는 레벨(1레벨 강조), 색·취소선은 상태(그룹이면 자손에서 파생한 effStatus).
  // 완료(Done): item-done(흐림+또렷한 취소선) 공통 스타일 → 그룹도 자식이 전부 끝나면 완료처럼 보인다.
  // 중단(Suspended): 종료(비완료) — 흐림(text-muted)만, 취소선은 없음(완료 아님).
  // 예정(Planned): 계획 시작일 전이면 흐림(text-muted), 계획 시작일이 지났는데 미착수면 진하게(착수 환기). 그 외: 레벨색.
  // 그룹은 착수 지연 판정(overdueStart) 대상이 아니다 — 마감은 자손이 들고 있다.
  const overdueStart = !isGroup && isOverdueToStart(item);
  const levelColor = depth === 0 ? 'text-accent' : 'text-primary';
  const nameWeight = depth === 0 ? 'font-semibold' : '';
  const nameColor =
    effStatus === 'Done'
      ? 'item-done'
      : effStatus === 'Suspended'
        ? 'text-muted'
        : (effStatus === 'Planned' || effStatus === 'Waiting')
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
            {/* 그룹은 마일스톤이 될 수 없다(배타) — 혹시 남아 있는 레거시 값이 있어도 표시하지 않는다. */}
            {!isGroup && item.isMilestone && <Diamond size={12} className="text-accent" />}
            {isGroup && (
              <FolderTree size={12} className="text-muted shrink-0" aria-hidden />
            )}
            <span
              className={`text-sm ${nameWeight} ${nameColor} hover:text-accent cursor-pointer transition-colors`}
              onClick={() => onEdit(item)}
              title={isGroup ? t('wbs:kind.groupNameTitle') : undefined}
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
            {/* 자식 진행률 — 그룹은 이게 주 표시, 자식 있는 Task 는 자기 상태 배지 옆의 보조 정보. */}
            {hasChildren && progress !== null && (
              <span className="ml-1 shrink-0" title={t('wbs:kind.rollupProgressTitle')}>
                <Badge variant={progress >= 1 ? 'success' : 'neutral'} size="sm">
                  {Math.round(progress * 100)}%
                </Badge>
              </span>
            )}
            {/* 빈 그룹 — 자식이 없으면 지표에서 조용히 빠진 채로 남는다. 눈에 띄게 경고. */}
            {isGroup && !hasChildren && (
              <span className="ml-1 shrink-0" title={t('wbs:kind.emptyGroupTitle')}>
                <Badge variant="warning" size="sm">
                  <AlertTriangle size={10} className="mr-0.5" /> {t('wbs:kind.emptyGroup')}
                </Badge>
              </span>
            )}
          </div>
        </td>
        <td className="py-2 px-3 text-sm text-secondary whitespace-nowrap truncate max-w-[7rem]" title={isGroup ? undefined : (item.assignee || undefined)}>{isGroup ? '' : item.assignee}</td>
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
        {/* 그룹 행은 그루핑 역할 — 중요도·상태는 자기 값이 무의미하다(지표에서도 빠진다). */}
        <td className="py-2 px-3 whitespace-nowrap">
          {!isGroup && <Badge variant={importance.variant} size="sm">{t(importance.labelKey)}</Badge>}
        </td>
        <td className="py-2 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          {isGroup ? (
            // 그룹의 상태는 자손에서 파생한 읽기 전용 값 — 직접 바꿀 수 없다.
            // 자손이 없으면(빈 그룹) 표시할 상태 자체가 없다.
            item.rollupStatus ? (
              <Badge variant={wbsStatusBadge[item.rollupStatus].variant} size="sm" title={t('wbs:kind.derivedStatusTitle')}>
                {t(wbsStatusBadge[item.rollupStatus].labelKey)}
              </Badge>
            ) : null
          ) : (
            // 자식이 있어도 Task 면 자기 상태를 직접 바꿀 수 있다 — 그게 '상위 작업' 의 의미다.
            <BadgeMenu<WbsStatus>
              value={item.status}
              options={(['Planned', 'Waiting', 'InProgress', 'Done', 'Suspended'] as WbsStatus[]).map((s) => ({
                value: s,
                label: t(wbsStatusBadge[s].labelKey),
                variant: wbsStatusBadge[s].variant,
              }))}
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
              onClick={() => onToggleKind(item)}
              title={isGroup ? t('wbs:kind.toTaskTitle') : t('wbs:kind.toGroupTitle')}
              aria-label={isGroup ? t('wbs:kind.toTaskAria', { name: item.name }) : t('wbs:kind.toGroupAria', { name: item.name })}
              className={`p-1 transition-colors ${isGroup ? 'text-accent hover:opacity-80' : 'text-muted hover:text-primary'}`}
            >
              <FolderTree size={14} />
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
              onToggleKind={onToggleKind}
            />
          ))}
        </SortableContext>
      )}
    </>
  );
}
