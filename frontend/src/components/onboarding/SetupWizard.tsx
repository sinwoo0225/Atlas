import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Settings2 } from 'lucide-react';
import { Modal, Button, FormField, inputClass } from '../ui';
import {
  loadSettings, patchSettings,
  MARKDOWN_FONT_SIZE_RANGE, MARKDOWN_LINE_HEIGHT_RANGE,
  type AppSettings, type ThemeMode,
} from '../../store/settings';
import { resourcesApi } from '../../api/resources';

// 마법사에서 노출할 테마 프리셋 — 라벨 키는 SettingsPage 와 동일(settings:appearance.*).
const THEME_PRESETS: [ThemeMode, string][] = [
  ['dark', 'themeDark'], ['darkGray', 'themeDarkGray'], ['chocoBanana', 'themeChocoBanana'],
  ['mugwort', 'themeMugwort'], ['dracula', 'themeDracula'], ['light', 'themeLight'],
  ['coolLight', 'themeCoolLight'], ['blueberryYogurt', 'themeBlueberryYogurt'],
];

type StepKey = 'intro' | 'language' | 'identity' | 'taskView' | 'theme' | 'markdown' | 'notifications' | 'done';
const STEPS: StepKey[] = ['intro', 'language', 'identity', 'taskView', 'theme', 'markdown', 'notifications', 'done'];

// 설정은 patchSettings 로 저장하고 'atlas:settings-changed' 로 라이브 적용(App 리스너가 테마·언어·마크다운 재적용).
function broadcast(partial: Partial<AppSettings>) {
  patchSettings(partial);
  window.dispatchEvent(new CustomEvent('atlas:settings-changed'));
}

function StepHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="space-y-1">
      <h3 className="text-lg font-semibold text-primary">{title}</h3>
      <p className="text-sm text-muted">{desc}</p>
    </div>
  );
}

export function SetupWizard({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [s, setS] = useState<AppSettings>(() => loadSettings());
  const [step, setStep] = useState(0);
  const [authorInput, setAuthorInput] = useState(() => loadSettings().defaultAuthor);
  const [resolvedName, setResolvedName] = useState<string | null>(null);

  const apply = (partial: Partial<AppSettings>) => { broadcast(partial); setS((prev) => ({ ...prev, ...partial })); };

  const setLanguage = (language: AppSettings['language']) => {
    apply({ language });
    if (i18n.language !== language) i18n.changeLanguage(language);
  };

  const resolveIdentity = async () => {
    const name = authorInput.trim();
    if (!name || name === resolvedName) return;
    apply({ defaultAuthor: name });
    try {
      const r = await resourcesApi.resolve(name);
      apply({ myResourceId: r.id });
      setResolvedName(name);
    } catch { /* 백엔드 미연결 — 이름만 저장, 다음 부팅에 재시도 */ }
  };

  const setNotif = (partial: Partial<AppSettings['notifications']>) =>
    apply({ notifications: { ...s.notifications, ...partial } });

  const key = STEPS[step];
  const total = STEPS.length;
  const isFirst = step === 0;
  const isLast = step === total - 1;

  const next = () => {
    if (key === 'identity') void resolveIdentity();
    if (isLast) onClose(); else setStep((v) => v + 1);
  };
  const back = () => setStep((v) => Math.max(0, v - 1));

  const changeable = <p className="text-xs text-muted/80 italic pt-2">{t('onboarding:changeableHint')}</p>;

  return (
    <Modal
      open
      onClose={onClose}
      title={t('onboarding:title')}
      size="lg"
      fixedHeight
      footer={
        <div className="flex items-center gap-2 w-full">
          <span className="text-xs text-muted">{t('onboarding:nav.step', { current: step + 1, total })}</span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>{t('onboarding:nav.skip')}</Button>
            {!isFirst && <Button variant="secondary" size="sm" onClick={back}>{t('onboarding:nav.back')}</Button>}
            <Button variant="primary" size="sm" onClick={next}>{isLast ? t('onboarding:nav.finish') : t('onboarding:nav.next')}</Button>
          </div>
        </div>
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto px-1 py-2 space-y-5">
        {key === 'intro' && (
          <div className="space-y-3">
            <StepHeader title={t('onboarding:intro.title')} desc="" />
            <p className="text-sm text-secondary leading-relaxed">{t('onboarding:intro.body')}</p>
          </div>
        )}

        {key === 'language' && (
          <div className="space-y-4">
            <StepHeader title={t('onboarding:language.title')} desc={t('onboarding:language.desc')} />
            <div className="flex gap-2">
              {(['ko', 'en'] as const).map((lng) => (
                <Button key={lng} variant={s.language === lng ? 'primary' : 'secondary'} onClick={() => setLanguage(lng)}>
                  {t(`onboarding:language.${lng}`)}
                </Button>
              ))}
            </div>
            {changeable}
          </div>
        )}

        {key === 'identity' && (
          <div className="space-y-4">
            <StepHeader title={t('onboarding:identity.title')} desc={t('onboarding:identity.desc')} />
            <FormField label={t('onboarding:identity.title')}>
              <div className="flex gap-2">
                <input
                  value={authorInput}
                  onChange={(e) => setAuthorInput(e.target.value)}
                  onBlur={() => void resolveIdentity()}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void resolveIdentity(); } }}
                  placeholder={t('onboarding:identity.placeholder')}
                  className={`${inputClass} flex-1`}
                />
                <Button variant="secondary" onClick={() => void resolveIdentity()}>{t('onboarding:identity.save')}</Button>
              </div>
            </FormField>
            {resolvedName && (
              <p className="text-sm text-on-success flex items-center gap-1">
                <Check size={14} /> {t('onboarding:identity.resolved', { name: resolvedName })}
              </p>
            )}
            <p className="text-xs text-muted/80 italic">{t('onboarding:identity.changeable')}</p>
          </div>
        )}

        {key === 'taskView' && (
          <div className="space-y-4">
            <StepHeader title={t('onboarding:taskView.title')} desc={t('onboarding:taskView.desc')} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(['list', 'calendar', 'kanban'] as const).map((view) => {
                const selected = s.defaultTaskView === view;
                return (
                  <button
                    key={view}
                    type="button"
                    onClick={() => apply({ defaultTaskView: view })}
                    className={`text-left rounded-lg border p-3 transition-colors ${selected ? 'border-accent ring-1 ring-accent bg-accent-soft' : 'border-default hover:border-strong bg-surface-2'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-medium ${selected ? 'text-accent' : 'text-primary'}`}>{t(`onboarding:taskView.${view}`)}</span>
                      {selected && <Check size={14} className="text-accent" />}
                    </div>
                    <TaskViewPreview view={view} />
                    <p className="text-[11px] text-muted mt-2">{t(`onboarding:taskView.${view}Desc`)}</p>
                  </button>
                );
              })}
            </div>
            {changeable}
          </div>
        )}

        {key === 'theme' && (
          <div className="space-y-4">
            <StepHeader title={t('onboarding:theme.title')} desc={t('onboarding:theme.desc')} />
            <div className="flex flex-wrap gap-2">
              {THEME_PRESETS.map(([m, labelKey]) => (
                <Button key={m} variant={s.theme === m ? 'primary' : 'secondary'} size="sm" onClick={() => apply({ theme: m })}>
                  {t(`settings:appearance.${labelKey}`)}
                </Button>
              ))}
            </div>
            {changeable}
          </div>
        )}

        {key === 'markdown' && (
          <div className="space-y-4">
            <StepHeader title={t('onboarding:markdown.title')} desc={t('onboarding:markdown.desc')} />
            <FormField label={`${t('onboarding:markdown.fontSize')} — ${s.markdownFontSize}px`}>
              <input
                type="range"
                min={MARKDOWN_FONT_SIZE_RANGE.min}
                max={MARKDOWN_FONT_SIZE_RANGE.max}
                step={MARKDOWN_FONT_SIZE_RANGE.step}
                value={s.markdownFontSize}
                onChange={(e) => apply({ markdownFontSize: parseFloat(e.target.value) })}
                className="w-full accent-accent"
              />
            </FormField>
            <FormField label={`${t('onboarding:markdown.lineHeight')} — ${s.markdownLineHeight}`}>
              <input
                type="range"
                min={MARKDOWN_LINE_HEIGHT_RANGE.min}
                max={MARKDOWN_LINE_HEIGHT_RANGE.max}
                step={MARKDOWN_LINE_HEIGHT_RANGE.step}
                value={s.markdownLineHeight}
                onChange={(e) => apply({ markdownLineHeight: parseFloat(e.target.value) })}
                className="w-full accent-accent"
              />
            </FormField>
            <div className="rounded-lg border border-default bg-surface-2 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted mb-1">{t('onboarding:markdown.sampleTitle')}</div>
              <div className="markdown-body">
                <h3>{t('onboarding:markdown.sampleHeading')}</h3>
                <p>{t('onboarding:markdown.sampleBody')}</p>
                <ul><li>Atlas</li><li>WBS · 이슈 · 업무일지</li></ul>
              </div>
            </div>
            {changeable}
          </div>
        )}

        {key === 'notifications' && (
          <div className="space-y-4">
            <StepHeader title={t('onboarding:notifications.title')} desc={t('onboarding:notifications.desc')} />
            <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
              <input type="checkbox" checked={s.notifications.enabled} onChange={(e) => setNotif({ enabled: e.target.checked })} className="accent-accent" />
              {t('onboarding:notifications.enabled')}
            </label>
            <label className={`flex items-center gap-2 text-sm cursor-pointer ${s.notifications.enabled ? 'text-secondary' : 'text-muted opacity-50'}`}>
              <input type="checkbox" disabled={!s.notifications.enabled} checked={s.notifications.showWhenMinimized} onChange={(e) => setNotif({ showWhenMinimized: e.target.checked })} className="accent-accent" />
              {t('onboarding:notifications.minimized')}
            </label>
            {changeable}
          </div>
        )}

        {key === 'done' && (
          <div className="space-y-3">
            <StepHeader title={t('onboarding:done.title')} desc="" />
            <p className="text-sm text-secondary leading-relaxed">{t('onboarding:done.body')}</p>
            <div className="flex items-start gap-2 rounded-lg border border-default bg-surface-2 p-3 text-sm text-muted">
              <Settings2 size={16} className="shrink-0 mt-0.5 text-accent" />
              <span>{t('onboarding:done.hint')}</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// 작업 탭 보기별 미니 예시(순수 장식). 실제 데이터 아님.
function TaskViewPreview({ view }: { view: 'list' | 'calendar' | 'kanban' }) {
  if (view === 'list') {
    return (
      <div className="space-y-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
            <span className="h-1.5 flex-1 rounded bg-surface-3" />
          </div>
        ))}
      </div>
    );
  }
  if (view === 'calendar') {
    return (
      <div className="grid grid-cols-5 gap-0.5">
        {Array.from({ length: 15 }).map((_, i) => (
          <span key={i} className={`h-2.5 rounded-sm ${i === 4 || i === 8 ? 'bg-accent' : 'bg-surface-3'}`} />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-1">
      {[0, 1, 2].map((c) => (
        <div key={c} className="rounded bg-surface-3 p-1 space-y-0.5">
          <span className="block h-1.5 rounded bg-accent/70" />
          <span className="block h-1.5 rounded bg-surface" />
        </div>
      ))}
    </div>
  );
}
