import type { TFunction } from 'i18next';
import type { IssueWbsLinkType } from '../types';
import type { BadgeVariant } from '../components/ui/Badge';

// 관계 타입 라벨 키 + Badge variant. 라벨은 i18n(status:linkType.*) 으로 로캘화.
export const LINK_TYPE_META: Record<IssueWbsLinkType, { labelKey: string; variant: BadgeVariant }> = {
  RelatesTo: { labelKey: 'status:linkType.RelatesTo', variant: 'neutral' },
  Blocks: { labelKey: 'status:linkType.Blocks', variant: 'danger' },
  ParentOf: { labelKey: 'status:linkType.ParentOf', variant: 'info' },
};

const LINK_TYPE_ORDER: IssueWbsLinkType[] = ['RelatesTo', 'Blocks', 'ParentOf'];

// BadgeMenu/select 옵션 — t 로 라벨을 로캘화한 배열. 호출처에서 useMemo([t]) 권장
// (BadgeMenu 가 label 문자열을 요구하므로 module-const 가 아닌 함수로 제공).
export function linkTypeOptions(t: TFunction): { value: IssueWbsLinkType; label: string; variant: BadgeVariant }[] {
  return LINK_TYPE_ORDER.map((value) => ({
    value,
    label: t(LINK_TYPE_META[value].labelKey),
    variant: LINK_TYPE_META[value].variant,
  }));
}
