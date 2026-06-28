import { todosApi } from '../../api/todos';
import type { NotificationDraft, NotificationSource } from '../types';

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dueLink(sourceType: string, projectId?: number | null): string {
  if (projectId == null) return '/todos';
  return sourceType === 'issue' ? `/projects/${projectId}/issues` : `/projects/${projectId}/wbs`;
}

// 마감 임박 일정(WBS)/이슈 — `/api/my-work` 재사용(mine/all 범위 지원).
// 개인 TODO 는 대상에서 제외(요구사항: 일정/이슈만). 단계별(overdue/today/soon) 1회 알림.
export const deadlineSource: NotificationSource = {
  key: 'deadline',
  isEnabled: (n) => n.deadline.enabled,
  // 서버(my-work) 조회라 사용자 폴링 주기로 throttle (최소 5분).
  minIntervalMs: (n) => Math.max(5, n.pollIntervalMinutes || 30) * 60_000,
  async collect({ settings, myResourceId, now }) {
    const d = settings.deadline;
    if (!d.enabled) return [];
    // 'mine' 인데 내 신원 미연동이면 대상 불명 — 조용히 skip(전체를 내 것처럼 알리지 않음).
    if (d.scope === 'mine' && myResourceId == null) return [];

    let items;
    try {
      const res = await todosApi.myWork(d.scope === 'mine' ? myResourceId : undefined);
      items = res.items;
    } catch {
      return [];
    }

    const today = startOfDay(now);
    const drafts: NotificationDraft[] = [];
    for (const it of items) {
      if (it.sourceType !== 'wbs' && it.sourceType !== 'issue') continue;
      if (!it.dueDate) continue;
      const due = startOfDay(new Date(it.dueDate));
      const days = Math.round((due - today) / 86400000);

      let stage: 'overdue' | 'today' | 'soon' | null = null;
      if (days < 0) {
        if (d.includeOverdue) stage = 'overdue';
      } else if (days === 0) {
        stage = 'today';
      } else if (days <= d.withinDays) {
        stage = 'soon';
      }
      if (!stage) continue;

      const i18nKey =
        stage === 'overdue'
          ? 'notifications:deadline.overdue'
          : stage === 'today'
            ? 'notifications:deadline.dueToday'
            : 'notifications:deadline.dueSoon';

      drafts.push({
        sourceKey: 'deadline',
        severity: stage === 'soon' ? 'warning' : 'danger',
        i18nKey,
        i18nParams: {
          title: it.title,
          // 메시지 끝에 붙는 ' · 프로젝트명'. 프로젝트 없으면 빈 문자열(꼬리표 미표시).
          project: it.projectName ? ` · ${it.projectName}` : '',
          days: Math.abs(days),
          kind: it.sourceType,
        },
        link: dueLink(it.sourceType, it.projectId),
        dedupKey: `deadline:${it.sourceType}:${it.id}:${stage}`,
      });
    }
    return drafts;
  },
};
