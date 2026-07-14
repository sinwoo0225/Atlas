import type { WbsItem } from '../types';

// 항목의 진행률(0~1). 표시 우선순위:
//   1) 서브태스크(경량 체크리스트)가 있으면 완료/전체 — 그 항목 자체의 진척이라 가장 구체적이다.
//   2) 자손이 있으면 서버가 계산한 rollupStatus/rollupProgress(자손 Task 의 Done 비율).
//   3) 그 외 null(진행률 바 미표시).
//
// rollupProgress 는 트리 조회에서만 채워진다(단건·평면 조회는 undefined) → 그 경우 로컬 트리로 계산해 fallback.
// 백엔드 정의와 동일: 분모 = 자손 중 Kind==Task && !isMilestone && status != Suspended, 분자 = 그 중 Done.
// 중단(Suspended)은 종료지만 완료가 아니라 분모에서 뺀다 — 안 그러면 [완료+중단]만 남아도 100% 에 못 닿는다.
export function wbsProgressOf(item: WbsItem): number | null {
  const stTotal = item.subtaskTotal ?? 0;
  if (stTotal > 0) return Math.min(1, (item.subtaskDone ?? 0) / stTotal);

  if (item.rollupProgress != null) return item.rollupProgress;

  if ((item.children?.length ?? 0) > 0) {
    let total = 0, done = 0;
    const visit = (n: WbsItem) => {
      if (n.kind !== 'Group' && !n.isMilestone && n.status !== 'Suspended') {
        total++;
        if (n.status === 'Done') done++;
      }
      n.children?.forEach(visit);
    };
    item.children?.forEach(visit);
    return total > 0 ? done / total : null;
  }
  return null;
}
