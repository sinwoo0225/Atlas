import type { IssueWbsLinkType } from '../types';
import type { BadgeVariant } from '../components/ui/Badge';

// 관계 타입 라벨 + Badge variant. BadgeMenu 옵션 구성에 그대로 매핑.
export const LINK_TYPE_META: Record<IssueWbsLinkType, { label: string; variant: BadgeVariant }> = {
  RelatesTo: { label: '관련', variant: 'neutral' },
  Blocks: { label: '차단', variant: 'danger' },
  ParentOf: { label: '부모', variant: 'info' },
};

export const LINK_TYPE_OPTIONS: { value: IssueWbsLinkType; label: string; variant: BadgeVariant }[] = [
  { value: 'RelatesTo', ...LINK_TYPE_META.RelatesTo },
  { value: 'Blocks', ...LINK_TYPE_META.Blocks },
  { value: 'ParentOf', ...LINK_TYPE_META.ParentOf },
];
