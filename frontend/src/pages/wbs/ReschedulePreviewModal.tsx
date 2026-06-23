import { useState } from 'react';
import { CalendarClock, ArrowRight, Save, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal, Button } from '../../components/ui';
import { wbsDependenciesApi } from '../../api/wbsDependencies';
import type { RescheduleResult } from '../../types';

// 의존성 기반 자동 리스케줄 미리보기 — 후행 작업의 이동 목록을 보여주고 확인 시 일괄 적용(push-only).
export function ReschedulePreviewModal({ projectId, preview, onApplied, onClose }: {
  projectId: number;
  preview: RescheduleResult;
  onApplied: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [applying, setApplying] = useState(false);

  const apply = async () => {
    if (applying) return;
    setApplying(true);
    try {
      await wbsDependenciesApi.rescheduleApply(projectId, preview);
      onApplied();
    } catch { /* api/client.ts 토스트 */ } finally { setApplying(false); }
  };

  const fmt = (d: string | null) => (d ? d.slice(0, 10) : '—');

  return (
    <Modal
      open
      onClose={onClose}
      title={t('wbs:reschedule.title', { count: preview.shifts.length })}
      size="md"
      showCloseButton
      footer={
        <>
          <Button variant="secondary" onClick={onClose} leadingIcon={<X size={16} />}>{t('common:cancel')}</Button>
          <Button variant="primary" onClick={apply} disabled={applying} leadingIcon={<Save size={16} />}>
            {t('wbs:reschedule.apply')}
          </Button>
        </>
      }
    >
      <div className="p-4 space-y-2">
        <p className="text-xs text-muted flex items-center gap-1.5">
          <CalendarClock size={14} /> {t('wbs:reschedule.desc')}
        </p>
        <ul className="space-y-1.5">
          {preview.shifts.map((s) => (
            <li key={s.wbsItemId} className="flex items-center gap-2 bg-surface-2 border border-default rounded px-3 py-2 text-sm">
              <span className="flex-1 text-primary truncate">{s.name}</span>
              <span className="text-xs text-muted">{fmt(s.oldStart)} ~ {fmt(s.oldEnd)}</span>
              <ArrowRight size={14} className="text-muted shrink-0" />
              <span className="text-xs text-on-warning">{fmt(s.newStart)} ~ {fmt(s.newEnd)}</span>
              <span className="text-[11px] text-muted shrink-0 w-12 text-right">
                {s.deltaDays > 0 ? `+${s.deltaDays}d` : `${s.deltaDays}d`}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
