import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, LayoutTemplate } from 'lucide-react';
import { Modal, Button, Badge, EmptyState, FormField, inputClass } from './ui';
import { wbsTemplatesApi } from '../api/wbsTemplates';
import type { WbsTemplateSummary } from '../types';

export interface TemplateApplySelection {
  templateId?: number | null;
  builtinKey?: string | null;
  anchorDate?: string | null;
  skipWeekends: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (sel: TemplateApplySelection) => void | Promise<void>;
  // 적용 대상 프로젝트의 시작일 (없으면 빈 문자열) — 앵커 기본값.
  defaultAnchorDate?: string;
  // 적용 중 비활성화.
  busy?: boolean;
  title?: string;
  // 기존 WBS 가 있는 경우 안내 문구 노출.
  hasExisting?: boolean;
}

function keyOf(t: WbsTemplateSummary): string {
  return t.isBuiltIn ? `b:${t.builtinKey}` : `c:${t.id}`;
}

export function WbsTemplatePicker({
  open,
  onClose,
  onApply,
  defaultAnchorDate = '',
  busy = false,
  title,
  hasExisting = false,
}: Props) {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<WbsTemplateSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [anchorDate, setAnchorDate] = useState(defaultAnchorDate.slice(0, 10));
  const [skipWeekends, setSkipWeekends] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTemplates(null);
    setError(null);
    setSelectedKey(null);
    setAnchorDate(defaultAnchorDate.slice(0, 10));
    setSkipWeekends(false);
    wbsTemplatesApi.list().then(setTemplates).catch(setError);
  }, [open, defaultAnchorDate]);

  const selected = templates?.find((tpl) => keyOf(tpl) === selectedKey) ?? null;

  const handleApply = () => {
    if (!selected) return;
    onApply({
      templateId: selected.isBuiltIn ? null : selected.id,
      builtinKey: selected.isBuiltIn ? selected.builtinKey : null,
      anchorDate: anchorDate || null,
      skipWeekends,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? t('templates:pickerTitle')}
      size="lg"
      showCloseButton
      footer={
        <>
          <Button variant="secondary" onClick={onClose} leadingIcon={<X size={16} />} disabled={busy}>
            {t('common:cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleApply}
            leadingIcon={<LayoutTemplate size={16} />}
            disabled={!selected || busy}
          >
            {busy ? t('templates:applying') : t('templates:apply')}
          </Button>
        </>
      }
    >
      {hasExisting && (
        <p className="text-xs text-on-warning bg-warning-soft rounded-md px-3 py-2 mb-3">
          {t('templates:appendNote')}
        </p>
      )}

      {templates === null && !error && <p className="text-sm text-muted py-4">{t('common:loading')}</p>}
      {error != null && <EmptyState error={error} onRetry={() => { setError(null); wbsTemplatesApi.list().then(setTemplates).catch(setError); }} />}

      {templates && templates.length === 0 && (
        <EmptyState
          icon={<LayoutTemplate size={32} />}
          title={t('templates:pickerEmptyTitle')}
          description={t('templates:pickerEmptyDesc')}
        />
      )}

      {templates && templates.length > 0 && (
        <div className="space-y-3">
          <div className="border border-default rounded-md divide-y divide-default max-h-[45vh] overflow-y-auto">
            {templates.map((tpl) => {
              const k = keyOf(tpl);
              const active = k === selectedKey;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={busy}
                  onClick={() => setSelectedKey(k)}
                  className={`w-full text-left p-3 transition-colors disabled:opacity-50 ${active ? 'bg-accent-soft' : 'hover:bg-elevated'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-primary truncate">{tpl.name}</div>
                      {tpl.description && (
                        <div className="text-sm text-muted truncate mt-0.5">{tpl.description}</div>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {tpl.category && <Badge size="sm" variant="neutral">{tpl.category}</Badge>}
                      {tpl.isBuiltIn && <Badge size="sm" variant="info">{t('templates:builtin')}</Badge>}
                      <Badge size="sm" variant="neutral">{t('templates:nodeCountShort', { count: tpl.nodeCount })}</Badge>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <FormField label={t('templates:picker.anchorDate')} hint={t('templates:picker.anchorHint')}>
              <input
                type="date"
                value={anchorDate}
                onChange={(e) => setAnchorDate(e.target.value)}
                className={inputClass}
              />
            </FormField>
            <label className="flex items-center gap-2 text-sm text-secondary pb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={skipWeekends}
                onChange={(e) => setSkipWeekends(e.target.checked)}
                className="w-auto"
              />
              {t('templates:picker.skipWeekends')}
            </label>
          </div>
        </div>
      )}
    </Modal>
  );
}
