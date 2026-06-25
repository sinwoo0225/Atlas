import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import {
  Save, Settings as SettingsIcon, FolderOpen, Server, Plug, Keyboard, Sparkles,
  Palette, Download, Upload, RotateCcw, AlertTriangle, Search as SearchIcon, FileText,
} from 'lucide-react';
import { openShortcutsModal } from '../data/shortcuts';
import { EULA_KO, EULA_EN } from '../data/eula';
import { aiApi } from '../api/ai';
import { resourcesApi } from '../api/resources';
import {
  loadSettings,
  saveSettings,
  getDefaultSettings,
  applyAppearance,
  DEFAULT_LOGO_PRIMARY,
  DEFAULT_LOGO_ACCENT,
  MARKDOWN_FONT_SIZE_RANGE,
  MARKDOWN_LINE_HEIGHT_RANGE,
  type AppSettings,
  type ThemeMode,
  type Language,
} from '../store/settings';
import {
  type BaseColors,
  DARK_BASE,
  LIGHT_BASE,
  BASE_COLOR_FIELDS,
} from '../utils/themeCustom';
import {
  MENU_ICON_SLOTS,
  ENTITY_ICON_SLOTS,
  SELECTABLE_ICONS,
  NamedIcon,
} from '../utils/iconRegistry';
import { useProjectStore } from '../store/useProjectStore';
import { Button, Card, FormField, Modal, Spinner, inputClass } from '../components/ui';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { systemApi, type DataFolderInfo, type DataFolderPreview, type BackupConfig, type BackupStatus, type UpdateConfig, type UpdateStatus } from '../api/system';
import {
  pickFolder,
  isHostBridgeAvailable,
  getConnectionConfig,
  setConnectionConfig,
  testServerConnection,
  type ConnectionConfig,
  type ConnectionMode,
} from '../utils/hostBridge';
import { formatDateTime } from '../i18n/format';

// 번들된 앱 아이콘 프리셋 (public/icons → 빌드 시 wwwroot/icons). 선택 시 data URL 로 변환해 저장.
const BRAND_ICON_PRESETS: { file: string; labelKey: string }[] = [
  { file: 'atlas-v2-compass.png', labelKey: 'settings:brandPresets.compass' },
  { file: 'atlas-v2-celestial.png', labelKey: 'settings:brandPresets.celestial' },
  { file: 'atlas-v2-constellation.png', labelKey: 'settings:brandPresets.constellation' },
  { file: 'atlas-v2-horizon.png', labelKey: 'settings:brandPresets.horizon' },
  { file: 'atlas-v2-mountain.png', labelKey: 'settings:brandPresets.mountain' },
  { file: 'atlas-v2-mountain-a.png', labelKey: 'settings:brandPresets.mountainA' },
  { file: 'atlas-v2-monogram.png', labelKey: 'settings:brandPresets.monogram' },
  { file: 'atlas-v2-brush.png', labelKey: 'settings:brandPresets.brush' },
  { file: 'atlas-v2-calligraphy.png', labelKey: 'settings:brandPresets.calligraphy' },
  { file: 'atlas-v2-at-calligraphy.png', labelKey: 'settings:brandPresets.atCalligraphy' },
  { file: 'atlas-v2-cute.png', labelKey: 'settings:brandPresets.cute' },
  { file: 'atlas-v2-cute-hills.png', labelKey: 'settings:brandPresets.cuteHills' },
];

type SettingsTab = 'appearance' | 'behavior' | 'system' | 'backup';
// label 은 렌더 시점에 t('settings:tabs.'+id) 로 해석 (id 가 곧 i18n 키).
const SETTINGS_TABS: { id: SettingsTab; icon: typeof Palette }[] = [
  { id: 'appearance', icon: Palette },
  { id: 'behavior', icon: Keyboard },
  { id: 'system', icon: Server },
  { id: 'backup', icon: Download },
];
const SETTINGS_TAB_KEY = 'atlas-settings-tab';

export function SettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AppSettings>(loadSettings());
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const saved = localStorage.getItem(SETTINGS_TAB_KEY);
    return saved === 'behavior' || saved === 'system' || saved === 'backup' ? saved : 'appearance';
  });
  const { projects } = useProjectStore();

  useEffect(() => {
    // 페이지 진입 시 현재 연결 모드 로드 — DataFolderSection 가시성 결정에도 사용.
    getConnectionConfig().then((c) => {
      if (c) setConnectionMode(c.mode);
      else setConnectionMode('Local'); // 브릿지 미가용 환경(dev) 은 Local 로 가정
    });
  }, []);

  // 외관(테마·커스텀색·로고색·제목·아이콘·마크다운) 라이브 프리뷰 — 저장 전에도 즉시 반영.
  // 외관에 영향 주는 필드만 의존성으로 둠 (전체 settings 면 lastProjectId 등에도 불필요 재실행).
  useEffect(() => {
    applyAppearance(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.theme,
    settings.customColors,
    settings.brandLogoPrimary,
    settings.brandLogoAccent,
    settings.brandTitle,
    settings.brandIcon,
    settings.markdownFontSize,
    settings.markdownLineHeight,
  ]);

  // 언어 라이브 프리뷰 — 저장 전에도 즉시 전환 (저장 시 App 의 atlas:settings-changed 리스너가 영속).
  useEffect(() => {
    if (i18n.language !== settings.language) i18n.changeLanguage(settings.language);
  }, [settings.language]);

  const update = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => {
    setSettings((s) => ({ ...s, [k]: v }));
  };

  // '나' 신원 통일 — 작성자 이름을 입력하고 포커스를 벗어나면 같은 이름의 Person 리소스를 찾거나 생성해
  // myResourceId 를 연동한다(멱등). 작성자·담당자·TODO 집계 주체가 한 리소스로 묶인다. 저장 시 persist.
  const resolveMyResource = async () => {
    const name = settings.defaultAuthor.trim();
    if (!name) { update('myResourceId', null); return; }
    try {
      const r = await resourcesApi.resolve(name);
      update('myResourceId', r.id);
    } catch {
      // resolve 실패는 무시 — 저장 자체는 막지 않음.
    }
  };

  const updateColor = (key: keyof BaseColors, v: string) =>
    setSettings((s) => ({ ...s, customColors: { ...s.customColors, [key]: v } }));

  const seedColors = (base: BaseColors) =>
    setSettings((s) => ({ ...s, theme: 'custom', customColors: { ...base } }));

  const setMenuIcon = (slot: string, name: string | null) =>
    setSettings((s) => {
      const next = { ...s.menuIcons };
      if (name) next[slot] = name; else delete next[slot];
      return { ...s, menuIcons: next };
    });

  const setEntityIcon = (slot: string, name: string | null) =>
    setSettings((s) => {
      const next = { ...s.entityIcons };
      if (name) next[slot] = name; else delete next[slot];
      return { ...s, entityIcons: next };
    });

  const [aiTesting, setAiTesting] = useState(false);
  const handleClaudeTest = async () => {
    setAiTesting(true);
    try {
      const r = await aiApi.claudeCheck();
      if (r.available) toast.success(t('settings:behavior.claudeOk') + (r.sample ? ` — "${r.sample.slice(0, 40)}"` : ''));
      else toast.error(r.error || t('settings:behavior.claudeCallFailed'));
    } catch {
      toast.error(t('settings:behavior.claudeTestFailed'));
    } finally {
      setAiTesting(false);
    }
  };

  const handleSave = () => {
    saveSettings(settings);
    // Toaster theme 등 동기화를 위해 App 에 알림 (P7-1)
    window.dispatchEvent(new CustomEvent('atlas:settings-changed'));
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2000);
  };

  const handleReset = async () => {
    if (!await confirmDialog({
      title: t('settings:reset.title'),
      message: t('settings:reset.message'),
      confirmLabel: t('settings:reset.confirm'),
      danger: true,
    })) return;
    localStorage.removeItem('pm-hub-settings');
    const fresh = loadSettings();
    setSettings(fresh);
    applyAppearance(fresh);
    window.dispatchEvent(new CustomEvent('atlas:settings-changed'));
  };

  // 설정 내보내기 — 현재 localStorage 전체를 JSON 파일로 저장 (백업·이전·공유용).
  const handleExport = () => {
    const data = JSON.stringify(loadSettings(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'atlas-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      // defaults 와 머지해 누락 키 보정 후 저장.
      const merged: AppSettings = {
        ...getDefaultSettings(),
        ...parsed,
        customColors: { ...getDefaultSettings().customColors, ...(parsed.customColors ?? {}) },
        menuIcons: { ...(parsed.menuIcons ?? {}) },
        entityIcons: { ...(parsed.entityIcons ?? {}) },
      };
      saveSettings(merged);
      setSettings(merged);
      applyAppearance(merged);
      window.dispatchEvent(new CustomEvent('atlas:settings-changed'));
      toast.success(t('settings:backup.imported'));
    } catch {
      toast.error(t('settings:backup.importFailed'));
    }
  };

  // 앱(작업표시줄/창) 아이콘 — 이미지를 data URL 로 읽어 brandIcon 에 저장.
  const brandIconInputRef = useRef<HTMLInputElement>(null);
  const handleBrandIconFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl.startsWith('data:image/')) {
        toast.error(t('settings:brand.iconOnlyImage'));
        return;
      }
      if (dataUrl.length > 256 * 1024) {
        toast.warning(t('settings:brand.iconTooBig'));
      }
      update('brandIcon', dataUrl);
    };
    reader.onerror = () => toast.error(t('settings:brand.iconReadFail'));
    reader.readAsDataURL(file);
  };

  // 번들 프리셋 선택 — /icons/*.png 를 가져와 data URL 로 변환해 저장(호스트로 전송 가능한 형태 유지).
  const handleBrandIconPreset = async (file: string) => {
    try {
      const res = await fetch(`/icons/${file}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => update('brandIcon', String(reader.result || ''));
      reader.readAsDataURL(blob);
    } catch {
      toast.error(t('settings:brand.presetLoadFail'));
    }
  };

  const [iconPicker, setIconPicker] = useState<
    { kind: 'menu' | 'entity'; slot: string; current: string } | null
  >(null);

  const lastProject = projects.find((p) => p.id === settings.lastProjectId);

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="h-page flex items-center gap-2">
          <SettingsIcon size={18} className="text-muted" />
          {t('settings:page.title')}
        </h1>
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-sm text-on-success">{t('settings:page.saved')}</span>}
          <Button variant="primary" onClick={handleSave} leadingIcon={<Save size={16} />}>
            {t('common:save')}
          </Button>
        </div>
      </div>

      {/* 카테고리 탭 — 12개 섹션을 모양/동작/시스템/백업·관리로 그룹화. 선택은 localStorage 에 보존. */}
      <div className="flex gap-1 border-b border-default -mt-2">
        {SETTINGS_TABS.map(({ id, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => { setActiveTab(id); localStorage.setItem(SETTINGS_TAB_KEY, id); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-accent text-accent font-medium'
                  : 'border-transparent text-secondary hover:text-primary'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={14} />
              {t('settings:tabs.' + id)}
            </button>
          );
        })}
      </div>

      {activeTab === 'appearance' && (<>
      <Section title={t('settings:appearance.title')}>
        <FormField label={t('settings:appearance.theme')}>
          <div className="flex flex-wrap gap-2">
            {([
              ['dark', 'themeDark'],
              ['darkGray', 'themeDarkGray'],
              ['chocoBanana', 'themeChocoBanana'],
              ['mugwort', 'themeMugwort'],
              ['dracula', 'themeDracula'],
              ['light', 'themeLight'],
              ['coolLight', 'themeCoolLight'],
              ['blueberryYogurt', 'themeBlueberryYogurt'],
              ['custom', 'themeCustom'],
            ] as [ThemeMode, string][]).map(([m, key]) => (
              <Button
                key={m}
                variant={settings.theme === m ? 'primary' : 'secondary'}
                size="md"
                onClick={() => update('theme', m)}
              >
                {t(`settings:appearance.${key}`)}
              </Button>
            ))}
          </div>
        </FormField>

        {settings.theme === 'custom' && (
          <FormField
            label={t('settings:appearance.customColors')}
            hint={t('settings:appearance.customColorsHint')}
          >
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Button variant="secondary" size="sm" onClick={() => seedColors(DARK_BASE)} leadingIcon={<Palette size={13} />}>
                  {t('settings:appearance.seedFromDark')}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => seedColors(LIGHT_BASE)} leadingIcon={<Palette size={13} />}>
                  {t('settings:appearance.seedFromLight')}
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                {BASE_COLOR_FIELDS.map(({ key, labelKey, hintKey }) => (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.customColors[key]}
                      onChange={(e) => updateColor(key, e.target.value)}
                      className="w-8 h-8 rounded border border-default bg-transparent cursor-pointer shrink-0"
                      aria-label={t(labelKey)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-secondary truncate" title={t(hintKey)}>{t(labelKey)}</div>
                      <input
                        value={settings.customColors[key]}
                        onChange={(e) => updateColor(key, e.target.value)}
                        className={`${inputClass} h-7 text-xs font-mono py-0`}
                        spellCheck={false}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FormField>
        )}
      </Section>

      <Section title={t('settings:brand.title')}>
        <FormField
          label={t('settings:brand.wordmark')}
          hint={t('settings:brand.wordmarkHint')}
        >
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <div className="text-xs text-muted mb-1">{t('settings:brand.front')}</div>
              <div className="flex items-center gap-2">
                <input
                  value={settings.brandPrimaryText}
                  onChange={(e) => update('brandPrimaryText', e.target.value)}
                  className={`${inputClass} w-24`}
                  placeholder="At"
                />
                <input
                  type="color"
                  value={settings.brandLogoPrimary}
                  onChange={(e) => update('brandLogoPrimary', e.target.value)}
                  className="w-8 h-8 rounded border border-default bg-transparent cursor-pointer"
                  aria-label={t('settings:brand.frontColor')}
                />
              </div>
            </div>
            <div>
              <div className="text-xs text-muted mb-1">{t('settings:brand.back')}</div>
              <div className="flex items-center gap-2">
                <input
                  value={settings.brandAccentText}
                  onChange={(e) => update('brandAccentText', e.target.value)}
                  className={`${inputClass} w-24`}
                  placeholder="las"
                />
                <input
                  type="color"
                  value={settings.brandLogoAccent}
                  onChange={(e) => update('brandLogoAccent', e.target.value)}
                  className="w-8 h-8 rounded border border-default bg-transparent cursor-pointer"
                  aria-label={t('settings:brand.backColor')}
                />
              </div>
            </div>
            <div className="text-2xl leading-none tracking-tight self-end pb-1">
              <span style={{ color: settings.brandLogoPrimary }}>{settings.brandPrimaryText || 'At'}</span>
              <span style={{ color: settings.brandLogoAccent }}>{settings.brandAccentText || 'las'}</span>
            </div>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={<RotateCcw size={13} />}
              onClick={() => {
                update('brandLogoPrimary', DEFAULT_LOGO_PRIMARY);
                update('brandLogoAccent', DEFAULT_LOGO_ACCENT);
              }}
            >
              {t('settings:brand.logoColorReset')}
            </Button>
          </div>
        </FormField>
        <FormField label={t('settings:brand.windowTitle')} hint={t('settings:brand.windowTitleHint')}>
          <input
            value={settings.brandTitle}
            onChange={(e) => update('brandTitle', e.target.value)}
            placeholder="Atlas"
            className={`${inputClass} w-48`}
          />
        </FormField>
        <FormField
          label={t('settings:brand.appIcon')}
          hint={t('settings:brand.appIconHint')}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-md border border-default bg-surface-2 flex items-center justify-center overflow-hidden shrink-0">
              {settings.brandIcon
                ? <img src={settings.brandIcon} alt={t('settings:brand.appIconAlt')} className="w-full h-full object-contain" />
                : <span className="text-[10px] text-muted">{t('settings:brand.iconDefault')}</span>}
            </div>
            <Button
              variant="secondary"
              size="md"
              onClick={() => brandIconInputRef.current?.click()}
              leadingIcon={<Upload size={14} />}
            >
              {t('settings:brand.pickImage')}
            </Button>
            {settings.brandIcon && (
              <Button variant="ghost" size="sm" leadingIcon={<RotateCcw size={13} />} onClick={() => update('brandIcon', '')}>
                {t('settings:brand.toDefault')}
              </Button>
            )}
            <input
              ref={brandIconInputRef}
              type="file"
              accept="image/png,image/x-icon,image/jpeg,image/bmp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleBrandIconFile(f);
                e.target.value = '';
              }}
            />
          </div>
          <div className="mt-3">
            <div className="text-xs text-muted mb-1.5">{t('settings:brand.fromPreset')}</div>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
              {BRAND_ICON_PRESETS.map(({ file, labelKey }) => (
                <button
                  key={file}
                  type="button"
                  onClick={() => handleBrandIconPreset(file)}
                  title={t(labelKey)}
                  className="aspect-square rounded-md border border-default hover:border-accent overflow-hidden bg-surface-2"
                >
                  <img src={`/icons/${file}`} alt={t(labelKey)} className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          </div>
        </FormField>
      </Section>

      <Section title={t('settings:markdown.title')}>
        <FormField
          label={t('settings:markdown.fontSize', { size: settings.markdownFontSize })}
          hint={t('settings:markdown.fontSizeHint')}
        >
          <input
            type="range"
            min={MARKDOWN_FONT_SIZE_RANGE.min}
            max={MARKDOWN_FONT_SIZE_RANGE.max}
            step={MARKDOWN_FONT_SIZE_RANGE.step}
            value={settings.markdownFontSize}
            onChange={(e) => update('markdownFontSize', Number(e.target.value))}
            className="w-full accent-current"
          />
        </FormField>
        <FormField label={t('settings:markdown.lineHeight', { value: settings.markdownLineHeight.toFixed(2) })}>
          <input
            type="range"
            min={MARKDOWN_LINE_HEIGHT_RANGE.min}
            max={MARKDOWN_LINE_HEIGHT_RANGE.max}
            step={MARKDOWN_LINE_HEIGHT_RANGE.step}
            value={settings.markdownLineHeight}
            onChange={(e) => update('markdownLineHeight', Number(e.target.value))}
            className="w-full accent-current"
          />
        </FormField>
        <FormField label={t('settings:markdown.preview')}>
          <div className="markdown-body bg-surface-2 border border-default rounded-md px-3 py-2">
            <ReactMarkdown>{t('settings:markdown.sample')}</ReactMarkdown>
          </div>
        </FormField>
      </Section>
      </>)}

      {activeTab === 'behavior' && (<>
      <Section title={t('settings:behavior.title')}>
        <FormField label={t('settings:language.label')} hint={t('settings:language.hint')}>
          <div className="flex gap-2">
            {(['ko', 'en'] as Language[]).map((lng) => (
              <Button
                key={lng}
                variant={settings.language === lng ? 'primary' : 'secondary'}
                size="md"
                onClick={() => update('language', lng)}
              >
                {t('settings:language.' + lng)}
              </Button>
            ))}
          </div>
        </FormField>

        <FormField
          label={t('settings:behavior.autoSelect')}
          hint={t('settings:behavior.autoSelectHint', { name: lastProject ? lastProject.name : t('settings:behavior.none') })}
        >
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoSelectLastProject}
              onChange={(e) => update('autoSelectLastProject', e.target.checked)}
            />
            <span className="text-sm text-secondary">{t('common:enable')}</span>
          </label>
        </FormField>

        <FormField label={t('settings:behavior.defaultAuthor')} hint={t('settings:behavior.defaultAuthorHint')}>
          <input
            value={settings.defaultAuthor}
            onChange={(e) => update('defaultAuthor', e.target.value)}
            onBlur={resolveMyResource}
            placeholder={t('settings:behavior.defaultAuthorPlaceholder')}
            className={inputClass}
          />
        </FormField>

        <FormField
          label={t('settings:behavior.defaultTaskView')}
          hint={t('settings:behavior.defaultTaskViewHint')}
        >
          <select
            value={settings.defaultTaskView}
            onChange={(e) => update('defaultTaskView', e.target.value as AppSettings['defaultTaskView'])}
            className={inputClass}
          >
            <option value="list">{t('settings:behavior.viewList')}</option>
            <option value="calendar">{t('settings:behavior.viewCalendar')}</option>
            <option value="kanban">{t('settings:behavior.viewKanban')}</option>
          </select>
        </FormField>
      </Section>

      <Section title={t('settings:behavior.shortcuts')}>
        <FormField
          label={t('settings:behavior.shortcutsHelp')}
          hint={t('settings:behavior.shortcutsHelpHint')}
        >
          <Button variant="secondary" onClick={openShortcutsModal} leadingIcon={<Keyboard size={14} />}>
            {t('settings:behavior.shortcutsHelpBtn')}
          </Button>
        </FormField>
      </Section>

      <Section title={t('settings:behavior.aiTitle')}>
        <div className="flex items-start gap-2 rounded-md bg-warning-soft border border-default px-3 py-2">
          <AlertTriangle size={15} className="text-on-warning shrink-0 mt-0.5" />
          <div className="text-xs text-on-warning space-y-1">
            <p><strong>{t('settings:behavior.aiWarnBold')}</strong> {t('settings:behavior.aiWarnText')}</p>
            <p className="text-secondary">
              {t('settings:behavior.aiCliDesc')}
            </p>
          </div>
        </div>
        <FormField
          label={t('settings:behavior.aiButtonLabel')}
          hint={t('settings:behavior.aiButtonHint')}
        >
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.aiSummaryEnabled}
              onChange={(e) => update('aiSummaryEnabled', e.target.checked)}
            />
            <span className="text-sm text-secondary">{t('settings:behavior.enableAfterSave')}</span>
          </label>
        </FormField>
        <FormField label={t('settings:behavior.connTest')} hint={t('settings:behavior.connTestHint')}>
          <Button variant="secondary" onClick={handleClaudeTest} disabled={aiTesting} leadingIcon={<Sparkles size={14} />}>
            {aiTesting ? t('settings:behavior.testing') : t('settings:behavior.test')}
          </Button>
        </FormField>
      </Section>
      </>)}

      {activeTab === 'system' && (<>
      <ConnectionModeSection onModeChanged={setConnectionMode} />

      {connectionMode === 'Local' && <DataFolderSection />}
      {connectionMode === 'Local' && <AutoBackupSection />}
      {connectionMode === 'Local' && <UpdateSection />}
      {connectionMode === 'Client' && (
        <Section title={t('settings:system.clientDataTitle')}>
          <p className="text-sm text-secondary">
            {t('settings:system.clientDataText')}
          </p>
        </Section>
      )}
      <AboutSection />
      </>)}

      {/* 아이콘은 '모양' 탭에 속하지만 Local/Client 조건 섹션 뒤에 위치 — 조건부 렌더라 탭 전환 시 올바른 그룹에 표시됨. */}
      {activeTab === 'appearance' && (
      <Section title={t('settings:icons.title')}>
        <FormField label={t('settings:icons.menuLabel')} hint={t('settings:icons.menuHint')}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {MENU_ICON_SLOTS.map(({ slot, labelKey, default: def }) => {
              const name = settings.menuIcons[slot] || def;
              const label = t(labelKey);
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setIconPicker({ kind: 'menu', slot, current: name })}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-default hover:bg-surface-2 text-left"
                  title={`${label} — ${name}`}
                >
                  <NamedIcon name={name} size={16} className="text-secondary shrink-0" />
                  <span className="text-sm text-secondary truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </FormField>
        <FormField label={t('settings:icons.entityLabel')} hint={t('settings:icons.entityHint')}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ENTITY_ICON_SLOTS.map(({ slot, labelKey, default: def }) => {
              const name = settings.entityIcons[slot] || def;
              const label = t(labelKey);
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setIconPicker({ kind: 'entity', slot, current: name })}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-default hover:bg-surface-2 text-left"
                  title={`${label} — ${name}`}
                >
                  <NamedIcon name={name} size={16} className="text-secondary shrink-0" />
                  <span className="text-sm text-secondary truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </FormField>
      </Section>
      )}

      {activeTab === 'backup' && (<>
      <Section title={t('settings:backup.title')}>
        <FormField
          label={t('settings:backup.location')}
          hint={t('settings:backup.locationHint')}
        >
          <p className="text-xs text-muted leading-relaxed">
            {t('settings:backup.storageNote')}
          </p>
        </FormField>
        <FormField label={t('settings:backup.exportImport')}>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="secondary" size="md" onClick={handleExport} leadingIcon={<Download size={14} />}>
              {t('settings:backup.export')}
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => fileInputRef.current?.click()}
              leadingIcon={<Upload size={14} />}
            >
              {t('settings:backup.import')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportFile(f);
                e.target.value = '';
              }}
            />
          </div>
        </FormField>
      </Section>

      <Section title={t('settings:backup.resetTitle')}>
        <FormField
          label={t('settings:backup.resetLabel')}
          hint={t('settings:backup.resetHint')}
        >
          <Button variant="danger" onClick={handleReset}>{t('settings:backup.resetBtn')}</Button>
        </FormField>
      </Section>
      </>)}

      {iconPicker && (
        <IconPickerModal
          current={iconPicker.current}
          onClose={() => setIconPicker(null)}
          onReset={() => {
            if (iconPicker.kind === 'menu') setMenuIcon(iconPicker.slot, null);
            else setEntityIcon(iconPicker.slot, null);
            setIconPicker(null);
          }}
          onPick={(name) => {
            if (iconPicker.kind === 'menu') setMenuIcon(iconPicker.slot, name);
            else setEntityIcon(iconPicker.slot, name);
            setIconPicker(null);
          }}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card padding="spacious">
      <h2 className="h-card mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

// 오픈소스 라이선스 고지 — 번들된 의존성의 라이선스 텍스트를 모달로 표시.
// public/THIRD-PARTY-NOTICES.txt (빌드 시 wwwroot 로 복사) 를 런타임 fetch.
// 모든 연결 모드·관리형(Store) 빌드에서 노출돼야 하므로 connectionMode 가드 밖에 둔다.
function AboutSection() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // 사용권(EULA) 모달 — 전문을 번들 상수에서 직접 표시(fetch 없음 → 오프라인·모든 모드 보장).
  const [eulaOpen, setEulaOpen] = useState(false);
  const eulaText = i18n.language === 'en' ? EULA_EN : EULA_KO;

  const openModal = async () => {
    setOpen(true);
    if (text !== null) return;
    setLoading(true);
    try {
      const res = await fetch('/THIRD-PARTY-NOTICES.txt');
      setText(res.ok ? await res.text() : t('settings:about.loadFailed'));
    } catch {
      setText(t('settings:about.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Section title={t('settings:about.title')}>
      <FormField label={t('settings:about.eula')} hint={t('settings:about.eulaHint')}>
        <Button variant="secondary" size="md" onClick={() => setEulaOpen(true)} leadingIcon={<FileText size={14} />}>
          {t('settings:about.viewEula')}
        </Button>
      </FormField>
      <FormField label={t('settings:about.licenses')} hint={t('settings:about.licensesHint')}>
        <Button variant="secondary" size="md" onClick={openModal} leadingIcon={<FileText size={14} />}>
          {t('settings:about.viewLicenses')}
        </Button>
      </FormField>
      <Modal
        open={eulaOpen}
        onClose={() => setEulaOpen(false)}
        title={t('settings:about.eulaTitle')}
        size="xxl"
        fixedHeight
        showCloseButton
      >
        <div className="markdown-body markdown-body--wide flex-1 min-h-0 overflow-auto text-sm leading-relaxed">
          <ReactMarkdown>{eulaText}</ReactMarkdown>
        </div>
      </Modal>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('settings:about.licensesTitle')}
        size="xxl"
        fixedHeight
        showCloseButton
      >
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Spinner /></div>
        ) : (
          <pre className="flex-1 min-h-0 overflow-auto text-xs text-secondary whitespace-pre-wrap font-mono leading-relaxed">
            {text}
          </pre>
        )}
      </Modal>
    </Section>
  );
}

const BACKUP_INTERVALS: { value: number; labelKey: string }[] = [
  { value: 24, labelKey: 'settings:autobackup.intervalDaily' },
  { value: 12, labelKey: 'settings:autobackup.intervalH12' },
  { value: 6, labelKey: 'settings:autobackup.intervalH6' },
  { value: 0, labelKey: 'settings:autobackup.intervalEveryLaunch' },
];

function AutoBackupSection() {
  const { t } = useTranslation();
  const bridgeAvailable = isHostBridgeAvailable();
  const [cfg, setCfg] = useState<BackupConfig | null>(null);
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const refresh = () => {
    systemApi.getBackupConfig().then(setCfg).catch(() => {});
    systemApi.getBackupStatus().then(setStatus).catch(() => {});
  };
  useEffect(() => { refresh(); }, []);

  if (!cfg) return null;

  const update = <K extends keyof BackupConfig>(k: K, v: BackupConfig[K]) =>
    setCfg((c) => (c ? { ...c, [k]: v } : c));

  const handleBrowse = async () => {
    const picked = await pickFolder(cfg.folder ?? undefined);
    if (picked) update('folder', picked);
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await systemApi.setBackupConfig(cfg);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
      refresh();
    } catch (e) {
      toast.error((e as Error).message || t('common:saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleRunNow = async () => {
    if (!cfg.folder?.trim()) {
      toast.error(t('settings:autobackup.needFolder'));
      return;
    }
    setRunning(true);
    try {
      // 현재 폴더/옵션을 먼저 저장한 뒤 즉시 백업 (백엔드는 저장된 설정을 사용).
      await systemApi.setBackupConfig(cfg);
      const r = await systemApi.runBackup();
      toast.success(t('settings:autobackup.backupDone', { fileName: r.fileName, kb: Math.round(r.sizeBytes / 1024) }));
      refresh();
    } catch (e) {
      toast.error((e as Error).message || t('settings:autobackup.backupFailed'));
    } finally {
      setRunning(false);
    }
  };

  const lastText = status?.lastBackupAt
    ? t('settings:autobackup.lastText', { date: formatDateTime(status.lastBackupAt), count: status.count })
    : t('settings:autobackup.noBackup');

  return (
    <Section title={t('settings:autobackup.title')}>
      <FormField
        label={t('settings:autobackup.enableLabel')}
        hint={t('settings:autobackup.enableHint')}
      >
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={cfg.enabled} onChange={(e) => update('enabled', e.target.checked)} />
          <span className="text-sm text-secondary">{t('common:enable')}</span>
        </label>
      </FormField>

      <FormField label={t('settings:autobackup.folder')} hint={t('settings:autobackup.folderHint')}>
        <div className="space-y-2">
          <input
            value={cfg.folder ?? ''}
            onChange={(e) => update('folder', e.target.value)}
            placeholder={t('settings:autobackup.folderPlaceholder')}
            className={inputClass}
            spellCheck={false}
          />
          {bridgeAvailable && (
            <Button variant="secondary" size="md" onClick={handleBrowse} leadingIcon={<FolderOpen size={14} />}>
              {t('settings:autobackup.browse')}
            </Button>
          )}
        </div>
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField label={t('settings:autobackup.interval')}>
          <select
            value={cfg.intervalHours}
            onChange={(e) => update('intervalHours', Number(e.target.value))}
            className={inputClass}
          >
            {BACKUP_INTERVALS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </select>
        </FormField>
        <FormField label={t('settings:autobackup.retention')} hint={t('settings:autobackup.retentionHint')}>
          <input
            type="number"
            min={0}
            value={cfg.retention}
            onChange={(e) => update('retention', Math.max(0, Number(e.target.value) || 0))}
            className={inputClass}
          />
        </FormField>
        <FormField label={t('settings:autobackup.includeFiles')}>
          <label className="flex items-center gap-2 cursor-pointer h-[38px]">
            <input type="checkbox" checked={cfg.includeFiles} onChange={(e) => update('includeFiles', e.target.checked)} />
            <span className="text-sm text-secondary">{t('settings:autobackup.dbPlusFiles')}</span>
          </label>
        </FormField>
      </div>

      <FormField label={t('settings:autobackup.status')} hint={t('settings:autobackup.statusHint')}>
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="primary" onClick={handleSave} disabled={busy} leadingIcon={<Save size={14} />}>
            {busy ? t('settings:autobackup.saving') : t('common:save')}
          </Button>
          <Button
            variant="secondary"
            onClick={handleRunNow}
            disabled={running || !cfg.folder?.trim()}
            leadingIcon={running ? <Spinner size="sm" /> : <Download size={14} />}
          >
            {running ? t('settings:autobackup.running') : t('settings:autobackup.runNow')}
          </Button>
          {savedAt && <span className="text-sm text-on-success">{t('settings:page.saved')}</span>}
          <span className="text-xs text-muted">{t('settings:autobackup.lastBackup', { text: lastText })}</span>
        </div>
      </FormField>
    </Section>
  );
}

const UPDATE_INTERVALS: { value: number; labelKey: string }[] = [
  { value: 24, labelKey: 'settings:update.intervalDaily' },
  { value: 12, labelKey: 'settings:update.intervalH12' },
  { value: 6, labelKey: 'settings:update.intervalH6' },
  { value: 168, labelKey: 'settings:update.intervalWeekly' },
];

function UpdateSection() {
  const { t } = useTranslation();
  const [cfg, setCfg] = useState<UpdateConfig | null>(null);
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const refreshStatus = () => systemApi.getUpdateStatus().then(setStatus).catch(() => {});
  useEffect(() => {
    systemApi.getUpdateConfig().then(setCfg).catch(() => {});
    refreshStatus();
  }, []);

  // 다운로드 중에는 진행률 폴링.
  useEffect(() => {
    if (status?.phase !== 'downloading') return;
    const id = setInterval(refreshStatus, 800);
    return () => clearInterval(id);
  }, [status?.phase]);

  if (!cfg) return null;

  // Microsoft Store(MSIX) 빌드 — 스토어가 업데이트를 자동 관리하므로 인앱 업데이트 컨트롤을 숨긴다.
  if (cfg.managedExternally) {
    return (
      <Section title={t('settings:update.title')}>
        <p className="text-sm text-secondary">
          {t('settings:update.managedText')}
        </p>
      </Section>
    );
  }

  const result = status?.lastResult ?? null;
  const phase = status?.phase ?? 'idle';
  const runningSessions = (status?.runningMcp ?? 0) + (status?.runningCli ?? 0);

  const handleCheck = async () => {
    setChecking(true);
    try {
      const r = await systemApi.checkUpdate();
      await refreshStatus();
      systemApi.getUpdateConfig().then(setCfg).catch(() => {});
      if (r.hasUpdate) toast.success(t('settings:update.toastAvailable', { version: r.latestVersion }));
      else toast.info(t('settings:update.toastLatest', { version: r.currentVersion }));
    } catch (e) {
      toast.error((e as Error).message || t('settings:update.checkFailed'));
    } finally {
      setChecking(false);
    }
  };

  const handleDownload = async () => {
    try {
      setStatus(await systemApi.startUpdateDownload());
    } catch (e) {
      toast.error((e as Error).message || t('settings:update.downloadFailed'));
    }
  };

  const handleLaunch = async () => {
    const message = runningSessions > 0
      ? t('settings:update.launchConfirmSessions', { count: runningSessions })
      : t('settings:update.launchConfirm');
    if (!await confirmDialog({ title: t('settings:update.launchTitle'), message, confirmLabel: t('settings:update.install'), danger: runningSessions > 0 })) return;
    try {
      await systemApi.launchUpdate();
    } catch (e) {
      toast.error((e as Error).message || t('settings:update.launchFailed'));
    }
  };

  const handleSaveConfig = async (enabled: boolean, intervalHours: number) => {
    setCfg((c) => (c ? { ...c, enabled, intervalHours } : c));
    try {
      await systemApi.setUpdateConfig(enabled, intervalHours);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e) {
      toast.error((e as Error).message || t('common:saveFailed'));
    }
  };

  const lastChecked = cfg.lastCheckedAt ? formatDateTime(cfg.lastCheckedAt) : t('settings:update.never');

  return (
    <Section title={t('settings:update.title')}>
      <FormField label={t('settings:update.currentVersion')}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-secondary">v{result?.currentVersion ?? '—'}</span>
          <Button
            variant="secondary"
            size="md"
            onClick={handleCheck}
            disabled={checking}
            leadingIcon={checking ? <Spinner size="sm" /> : <RotateCcw size={14} />}
          >
            {checking ? t('settings:update.checking') : t('settings:update.checkNow')}
          </Button>
          <span className="text-xs text-muted">{t('settings:update.lastChecked', { when: lastChecked })}</span>
        </div>
      </FormField>

      {result?.hasUpdate ? (
        <FormField
          label={t('settings:update.newVersion', { version: result.latestVersion })}
          hint={result.sizeBytes > 0 ? t('settings:update.fileSize', { mb: Math.round(result.sizeBytes / 1024 / 1024) }) : undefined}
        >
          <div className="space-y-3">
            {result.releaseNotes && (
              <div className="max-h-40 overflow-y-auto text-sm text-secondary border border-default rounded-md p-3 whitespace-pre-wrap">
                {result.releaseNotes}
              </div>
            )}

            {phase === 'downloading' ? (
              <div className="space-y-1">
                <div className="h-2 rounded bg-surface-2 overflow-hidden">
                  <div className="h-full bg-accent transition-all" style={{ width: `${status?.percent ?? 0}%` }} />
                </div>
                <span className="text-xs text-muted">{t('settings:update.downloading', { percent: status?.percent ?? 0 })}</span>
              </div>
            ) : phase === 'ready' && status?.downloadedPath ? (
              <div className="flex items-center gap-3 flex-wrap">
                <Button variant="primary" onClick={handleLaunch} leadingIcon={<Download size={14} />}>
                  {t('settings:update.install')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => systemApi.revealUpdate().catch(() => {})}
                  leadingIcon={<FolderOpen size={14} />}
                >
                  {t('settings:update.openFolder')}
                </Button>
                {runningSessions > 0 && (
                  <span className="text-xs text-on-warning">{t('settings:update.sessionsWarn', { count: runningSessions })}</span>
                )}
              </div>
            ) : (
              <Button variant="primary" onClick={handleDownload} disabled={!result.downloadUrl} leadingIcon={<Download size={14} />}>
                {t('settings:update.download')}
              </Button>
            )}

            {phase === 'error' && status?.error && <span className="text-sm text-on-danger">{status.error}</span>}
          </div>
        </FormField>
      ) : (
        phase === 'error' && status?.error && (
          <FormField label={t('settings:update.checkResult')}><span className="text-sm text-on-danger">{status.error}</span></FormField>
        )
      )}

      <FormField
        label={t('settings:update.autoCheck')}
        hint={t('settings:update.autoCheckHint')}
      >
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={cfg.enabled}
              onChange={(e) => handleSaveConfig(e.target.checked, cfg.intervalHours)}
            />
            <span className="text-sm text-secondary">{t('common:enable')}</span>
          </label>
          <select
            className={inputClass}
            style={{ width: 'auto' }}
            value={cfg.intervalHours}
            disabled={!cfg.enabled}
            onChange={(e) => handleSaveConfig(cfg.enabled, Number(e.target.value))}
          >
            {UPDATE_INTERVALS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </select>
          {savedAt && <span className="text-sm text-on-success">{t('settings:page.saved')}</span>}
        </div>
      </FormField>
    </Section>
  );
}

function IconPickerModal({
  current,
  onPick,
  onReset,
  onClose,
}: {
  current: string;
  onPick: (name: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const filtered = q.trim()
    ? SELECTABLE_ICONS.filter((n) => n.toLowerCase().includes(q.trim().toLowerCase()))
    : SELECTABLE_ICONS;

  return (
    <Modal open onClose={onClose} title={t('settings:icons.pickTitle')} size="lg" showCloseButton>
      <div className="space-y-3">
        <div className="relative">
          <SearchIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('settings:icons.searchPlaceholder')}
            className={`${inputClass} pl-8`}
            spellCheck={false}
          />
        </div>
        <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 max-h-[50vh] overflow-y-auto">
          {filtered.map((name) => {
            const selected = name === current;
            return (
              <button
                key={name}
                type="button"
                onClick={() => onPick(name)}
                title={name}
                className={`flex items-center justify-center aspect-square rounded-md border ${
                  selected ? 'border-accent bg-accent-soft text-accent' : 'border-default hover:bg-surface-2 text-secondary'
                }`}
              >
                <NamedIcon name={name} size={18} />
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-full text-sm text-muted py-4 text-center">{t('settings:icons.noMatch')}</p>
          )}
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" leadingIcon={<RotateCcw size={13} />} onClick={onReset}>
            {t('settings:icons.toDefault')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ConnectionModeSection({ onModeChanged }: { onModeChanged: (m: ConnectionMode) => void }) {
  const { t } = useTranslation();
  const bridgeAvailable = isHostBridgeAvailable();
  // 브릿지 미가용 환경은 진입 시점에 이미 로드 완료로 간주 — 비동기 작업이 없음.
  const [loaded, setLoaded] = useState(() => !bridgeAvailable);
  const [draft, setDraft] = useState<ConnectionConfig>({ mode: 'Local', serverUrl: '', apiKey: '' });
  const [savedConfig, setSavedConfig] = useState<ConnectionConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!bridgeAvailable) return;
    getConnectionConfig().then((c) => {
      if (c) {
        const initial: ConnectionConfig = {
          mode: c.mode,
          serverUrl: c.serverUrl ?? '',
          apiKey: c.apiKey ?? '',
        };
        setDraft(initial);
        setSavedConfig(initial);
      }
      setLoaded(true);
    });
  }, [bridgeAvailable]);

  const isDirty = savedConfig !== null && (
    draft.mode !== savedConfig.mode ||
    (draft.serverUrl ?? '') !== (savedConfig.serverUrl ?? '') ||
    (draft.apiKey ?? '') !== (savedConfig.apiKey ?? '')
  );

  const handleTest = async () => {
    if (!draft.serverUrl) return;
    setTesting(true);
    setTestResult(null);
    const r = await testServerConnection(draft.serverUrl, draft.apiKey || null);
    setTesting(false);
    if (!r) {
      setTestResult({ ok: false, message: t('settings:conn.testNoBridge') });
      return;
    }
    if (r.ok) setTestResult({ ok: true, message: t('settings:conn.testOk') });
    else if (r.status === 401) setTestResult({ ok: false, message: t('settings:conn.test401') });
    else if (r.status > 0) setTestResult({ ok: false, message: t('settings:conn.testHttpErr', { status: r.status }) });
    else setTestResult({ ok: false, message: r.error ?? t('settings:conn.testNetErr') });
  };

  const handleSave = async () => {
    setBusy(true);
    const res = await setConnectionConfig({
      mode: draft.mode,
      serverUrl: draft.serverUrl?.trim() || null,
      apiKey: draft.apiKey?.trim() || null,
    });
    setBusy(false);
    if (res?.saved) {
      setSavedConfig(draft);
      setSavedAt(Date.now());
      onModeChanged(draft.mode);
      setTimeout(() => setSavedAt(null), 4000);
    }
  };

  return (
    <Section title={t('settings:conn.title')}>
      {!bridgeAvailable && (
        <p className="text-sm text-muted">
          {t('settings:conn.bridgeOnly')}
        </p>
      )}
      {bridgeAvailable && loaded && (
        <>
          <FormField label={t('settings:conn.mode')} hint={t('settings:conn.modeHint')}>
            <div className="flex flex-col gap-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="connMode"
                  checked={draft.mode === 'Local'}
                  onChange={() => setDraft((d) => ({ ...d, mode: 'Local' }))}
                  className="mt-1"
                />
                <span className="text-sm">
                  <span className="text-primary font-medium inline-flex items-center gap-1.5">
                    <Server size={14} /> {t('settings:conn.localTitle')}
                  </span>
                  <span className="block text-xs text-muted">{t('settings:conn.localDesc')}</span>
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="connMode"
                  checked={draft.mode === 'Client'}
                  onChange={() => setDraft((d) => ({ ...d, mode: 'Client' }))}
                  className="mt-1"
                />
                <span className="text-sm">
                  <span className="text-primary font-medium inline-flex items-center gap-1.5">
                    <Plug size={14} /> {t('settings:conn.clientTitle')}
                  </span>
                  <span className="block text-xs text-muted">{t('settings:conn.clientDesc')}</span>
                </span>
              </label>
            </div>
          </FormField>

          {draft.mode === 'Client' && (
            <>
              <FormField label={t('settings:conn.serverUrl')} hint={t('settings:conn.serverUrlHint')}>
                <input
                  value={draft.serverUrl ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, serverUrl: e.target.value }))}
                  placeholder="http://host:5200"
                  className={inputClass}
                />
              </FormField>
              <FormField label={t('settings:conn.apiKey')} hint={t('settings:conn.apiKeyHint')}>
                <input
                  type="password"
                  value={draft.apiKey ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
                  placeholder={t('settings:conn.optional')}
                  className={inputClass}
                />
              </FormField>
              <FormField label={t('settings:conn.test')}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={handleTest}
                    disabled={testing || !draft.serverUrl}
                  >
                    {testing ? t('settings:conn.testing') : t('settings:conn.testBtn')}
                  </Button>
                  {testResult && (
                    <span className={`text-xs ${testResult.ok ? 'text-on-success' : 'text-on-danger'}`}>
                      {testResult.message}
                    </span>
                  )}
                </div>
              </FormField>
            </>
          )}

          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={handleSave} disabled={busy || !isDirty} leadingIcon={busy ? <Spinner size="sm" /> : undefined}>
              {busy ? t('settings:conn.saving') : t('common:save')}
            </Button>
            {savedAt && (
              <span className="text-xs text-on-warning">{t('settings:conn.savedRestart')}</span>
            )}
            {isDirty && !savedAt && (
              <span className="text-xs text-muted">{t('settings:conn.dirty')}</span>
            )}
          </div>
        </>
      )}
    </Section>
  );
}

function DataFolderSection() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<DataFolderInfo | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<DataFolderPreview | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bridgeAvailable = isHostBridgeAvailable();

  useEffect(() => {
    systemApi.getDataFolder().then(setInfo).catch((e) => setError((e as Error).message));
  }, []);

  const handleBrowse = async () => {
    setError(null);
    const picked = await pickFolder(info?.current);
    if (!picked) return;
    setBusy(true);
    try {
      const p = await systemApi.previewDataFolder(picked);
      setPendingPath(picked);
      setPreview(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!pendingPath) return;
    setBusy(true);
    setError(null);
    try {
      const res = await systemApi.setDataFolder(pendingPath);
      setSavedPath(res.saved);
      setPendingPath(null);
      setPreview(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    setPendingPath(null);
    setPreview(null);
  };

  const currentDisplay = savedPath ?? info?.current ?? t('settings:data.loading');

  return (
    <>
      <Section title={t('settings:data.title')}>
        <FormField
          label={t('settings:data.location')}
          hint={t('settings:data.locationHint')}
        >
          <div className="space-y-2">
            <code className="block bg-surface-2 px-2 py-1.5 rounded text-xs break-all">
              {currentDisplay}
            </code>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="secondary"
                size="md"
                onClick={handleBrowse}
                disabled={busy || !bridgeAvailable}
                leadingIcon={<FolderOpen size={14} />}
              >
                {t('settings:data.change')}
              </Button>
              {!bridgeAvailable && (
                <span className="text-xs text-muted">{t('settings:data.desktopOnly')}</span>
              )}
              {savedPath && (
                <span className="text-xs text-on-warning">{t('settings:data.changedRestart')}</span>
              )}
            </div>
            {error && <p className="text-xs text-on-danger">{error}</p>}
          </div>
        </FormField>
      </Section>

      {pendingPath && preview && (
        <DataFolderConfirmModal
          path={pendingPath}
          preview={preview}
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}

function DataFolderConfirmModal({
  path,
  preview,
  busy,
  onConfirm,
  onCancel,
}: {
  path: string;
  preview: DataFolderPreview;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const blocked = !preview.isWritable;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="bg-surface border border-default rounded-lg p-6 max-w-lg w-full m-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">{t('settings:data.confirmTitle')}</h3>
        <code className="block bg-surface-2 px-2 py-1.5 rounded text-xs break-all">{path}</code>

        <div className="space-y-2 text-sm text-secondary">
          {!preview.exists && (
            <p>{t('settings:data.notExist')}</p>
          )}
          {preview.exists && !preview.hasExistingDb && (
            <p>{t('settings:data.noExistingDb')}</p>
          )}
          {preview.hasExistingDb && (
            <p>{t('settings:data.foundDb', { suffix: preview.projectCount !== null ? t('settings:data.projectCount', { count: preview.projectCount }) : '' })}</p>
          )}
          {preview.warnings.length > 0 && (
            <ul className="list-disc list-inside text-on-warning text-xs space-y-1">
              {preview.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          {blocked && (
            <p className="text-on-danger text-xs">{t('settings:data.notWritable')}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {t('common:cancel')}
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={busy || blocked}>
            {busy ? t('settings:data.saving') : t('settings:data.change')}
          </Button>
        </div>
      </div>
    </div>
  );
}
