import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import {
  Save, Settings as SettingsIcon, FolderOpen, Server, Plug, Keyboard, Sparkles,
  Palette, Download, Upload, RotateCcw, AlertTriangle, Search as SearchIcon,
} from 'lucide-react';
import { openShortcutsModal } from '../data/shortcuts';
import { aiApi } from '../api/ai';
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

// 번들된 앱 아이콘 프리셋 (public/icons → 빌드 시 wwwroot/icons). 선택 시 data URL 로 변환해 저장.
const BRAND_ICON_PRESETS: { file: string; label: string }[] = [
  { file: 'atlas-v2-compass.png', label: '나침반' },
  { file: 'atlas-v2-celestial.png', label: '천체' },
  { file: 'atlas-v2-constellation.png', label: '별자리' },
  { file: 'atlas-v2-horizon.png', label: '지평선' },
  { file: 'atlas-v2-mountain.png', label: '산' },
  { file: 'atlas-v2-mountain-a.png', label: '산 A' },
  { file: 'atlas-v2-monogram.png', label: '모노그램' },
  { file: 'atlas-v2-brush.png', label: '브러시' },
  { file: 'atlas-v2-calligraphy.png', label: '캘리그래피' },
  { file: 'atlas-v2-at-calligraphy.png', label: 'At 캘리그래피' },
  { file: 'atlas-v2-cute.png', label: '큐트' },
  { file: 'atlas-v2-cute-hills.png', label: '큐트 언덕' },
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
          <div className="flex gap-2">
            {(['dark', 'light', 'custom'] as ThemeMode[]).map((m) => (
              <Button
                key={m}
                variant={settings.theme === m ? 'primary' : 'secondary'}
                size="md"
                onClick={() => update('theme', m)}
              >
                {m === 'dark' ? t('settings:appearance.themeDark') : m === 'light' ? t('settings:appearance.themeLight') : t('settings:appearance.themeCustom')}
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
                {BASE_COLOR_FIELDS.map(({ key, label, hint }) => (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.customColors[key]}
                      onChange={(e) => updateColor(key, e.target.value)}
                      className="w-8 h-8 rounded border border-default bg-transparent cursor-pointer shrink-0"
                      aria-label={label}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-secondary truncate" title={hint}>{label}</div>
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
              {BRAND_ICON_PRESETS.map(({ file, label }) => (
                <button
                  key={file}
                  type="button"
                  onClick={() => handleBrandIconPreset(file)}
                  title={label}
                  className="aspect-square rounded-md border border-default hover:border-accent overflow-hidden bg-surface-2"
                >
                  <img src={`/icons/${file}`} alt={label} className="w-full h-full object-contain" />
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

        <FormField label={t('settings:behavior.defaultAuthor')}>
          <input
            value={settings.defaultAuthor}
            onChange={(e) => update('defaultAuthor', e.target.value)}
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
      </>)}

      {/* 아이콘은 '모양' 탭에 속하지만 Local/Client 조건 섹션 뒤에 위치 — 조건부 렌더라 탭 전환 시 올바른 그룹에 표시됨. */}
      {activeTab === 'appearance' && (
      <Section title={t('settings:icons.title')}>
        <FormField label={t('settings:icons.menuLabel')} hint={t('settings:icons.menuHint')}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {MENU_ICON_SLOTS.map(({ slot, label, default: def }) => {
              const name = settings.menuIcons[slot] || def;
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
            {ENTITY_ICON_SLOTS.map(({ slot, label, default: def }) => {
              const name = settings.entityIcons[slot] || def;
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

const BACKUP_INTERVALS: { value: number; label: string }[] = [
  { value: 24, label: '매일 (24시간)' },
  { value: 12, label: '12시간' },
  { value: 6, label: '6시간' },
  { value: 0, label: '앱 실행마다' },
];

function AutoBackupSection() {
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
      toast.error((e as Error).message || '저장 실패');
    } finally {
      setBusy(false);
    }
  };

  const handleRunNow = async () => {
    if (!cfg.folder?.trim()) {
      toast.error('먼저 백업 폴더를 지정하세요.');
      return;
    }
    setRunning(true);
    try {
      // 현재 폴더/옵션을 먼저 저장한 뒤 즉시 백업 (백엔드는 저장된 설정을 사용).
      await systemApi.setBackupConfig(cfg);
      const r = await systemApi.runBackup();
      toast.success(`백업 완료 — ${r.fileName} (${Math.round(r.sizeBytes / 1024)} KB)`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message || '백업 실패');
    } finally {
      setRunning(false);
    }
  };

  const lastText = status?.lastBackupAt
    ? `${new Date(status.lastBackupAt).toLocaleString()} (총 ${status.count}개 보관)`
    : '아직 백업 없음';

  return (
    <Section title="자동 백업">
      <FormField
        label="자동 백업 사용"
        hint="전체 데이터(DB + 첨부파일)를 지정한 폴더로 주기적으로 내보냅니다. 그 폴더가 OneDrive·Dropbox 등 동기화 폴더면 자동으로 클라우드에 올라갑니다."
      >
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={cfg.enabled} onChange={(e) => update('enabled', e.target.checked)} />
          <span className="text-sm text-secondary">활성화</span>
        </label>
      </FormField>

      <FormField label="백업 폴더" hint="데이터 폴더 안에는 둘 수 없습니다(재귀 방지). 클라우드 동기화 폴더 권장.">
        <div className="space-y-2">
          <input
            value={cfg.folder ?? ''}
            onChange={(e) => update('folder', e.target.value)}
            placeholder="예: C:\Users\me\OneDrive\AtlasBackups"
            className={inputClass}
            spellCheck={false}
          />
          {bridgeAvailable && (
            <Button variant="secondary" size="md" onClick={handleBrowse} leadingIcon={<FolderOpen size={14} />}>
              찾아보기
            </Button>
          )}
        </div>
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField label="주기">
          <select
            value={cfg.intervalHours}
            onChange={(e) => update('intervalHours', Number(e.target.value))}
            className={inputClass}
          >
            {BACKUP_INTERVALS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </FormField>
        <FormField label="보관 개수" hint="0 = 무제한">
          <input
            type="number"
            min={0}
            value={cfg.retention}
            onChange={(e) => update('retention', Math.max(0, Number(e.target.value) || 0))}
            className={inputClass}
          />
        </FormField>
        <FormField label="첨부파일 포함">
          <label className="flex items-center gap-2 cursor-pointer h-[38px]">
            <input type="checkbox" checked={cfg.includeFiles} onChange={(e) => update('includeFiles', e.target.checked)} />
            <span className="text-sm text-secondary">DB + 첨부</span>
          </label>
        </FormField>
      </div>

      <FormField label="상태" hint="복구: zip 을 풀어 데이터 폴더에 덮어쓰거나(앱 종료 상태), 프로젝트별로 '가져오기' 사용.">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="primary" onClick={handleSave} disabled={busy} leadingIcon={<Save size={14} />}>
            {busy ? '저장 중…' : '저장'}
          </Button>
          <Button
            variant="secondary"
            onClick={handleRunNow}
            disabled={running || !cfg.folder?.trim()}
            leadingIcon={running ? <Spinner size="sm" /> : <Download size={14} />}
          >
            {running ? '백업 중…' : '지금 백업'}
          </Button>
          {savedAt && <span className="text-sm text-on-success">저장되었습니다.</span>}
          <span className="text-xs text-muted">마지막 백업: {lastText}</span>
        </div>
      </FormField>
    </Section>
  );
}

const UPDATE_INTERVALS: { value: number; label: string }[] = [
  { value: 24, label: '매일 (24시간)' },
  { value: 12, label: '12시간' },
  { value: 6, label: '6시간' },
  { value: 168, label: '매주' },
];

function UpdateSection() {
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
      <Section title="업데이트">
        <p className="text-sm text-secondary">
          Microsoft Store 버전은 새 버전을 자동으로 받아 설치합니다. 수동으로 확인할 필요가 없습니다.
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
      if (r.hasUpdate) toast.success(`새 버전 v${r.latestVersion} 사용 가능`);
      else toast.info(`최신 버전입니다 (v${r.currentVersion})`);
    } catch (e) {
      toast.error((e as Error).message || '업데이트 확인 실패');
    } finally {
      setChecking(false);
    }
  };

  const handleDownload = async () => {
    try {
      setStatus(await systemApi.startUpdateDownload());
    } catch (e) {
      toast.error((e as Error).message || '다운로드 시작 실패');
    }
  };

  const handleLaunch = async () => {
    const message = runningSessions > 0
      ? `설치 프로그램을 실행하면 현재 실행 중인 Atlas와 연결된 Claude(MCP/CLI) 세션 ${runningSessions}개가 모두 종료됩니다. 진행할까요?`
      : '설치 프로그램을 실행하면 Atlas가 종료되고 새 버전이 설치됩니다. 진행할까요?';
    if (!await confirmDialog({ title: '업데이트 설치', message, confirmLabel: '설치 실행', danger: runningSessions > 0 })) return;
    try {
      await systemApi.launchUpdate();
    } catch (e) {
      toast.error((e as Error).message || '설치 실행 실패');
    }
  };

  const handleSaveConfig = async (enabled: boolean, intervalHours: number) => {
    setCfg((c) => (c ? { ...c, enabled, intervalHours } : c));
    try {
      await systemApi.setUpdateConfig(enabled, intervalHours);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e) {
      toast.error((e as Error).message || '저장 실패');
    }
  };

  const lastChecked = cfg.lastCheckedAt ? new Date(cfg.lastCheckedAt).toLocaleString() : '없음';

  return (
    <Section title="업데이트">
      <FormField label="현재 버전">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-secondary">v{result?.currentVersion ?? '—'}</span>
          <Button
            variant="secondary"
            size="md"
            onClick={handleCheck}
            disabled={checking}
            leadingIcon={checking ? <Spinner size="sm" /> : <RotateCcw size={14} />}
          >
            {checking ? '확인 중…' : '지금 확인'}
          </Button>
          <span className="text-xs text-muted">마지막 확인: {lastChecked}</span>
        </div>
      </FormField>

      {result?.hasUpdate ? (
        <FormField
          label={`새 버전 v${result.latestVersion}`}
          hint={result.sizeBytes > 0 ? `설치 파일 약 ${Math.round(result.sizeBytes / 1024 / 1024)} MB` : undefined}
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
                <span className="text-xs text-muted">다운로드 중… {status?.percent ?? 0}%</span>
              </div>
            ) : phase === 'ready' && status?.downloadedPath ? (
              <div className="flex items-center gap-3 flex-wrap">
                <Button variant="primary" onClick={handleLaunch} leadingIcon={<Download size={14} />}>
                  설치 실행
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => systemApi.revealUpdate().catch(() => {})}
                  leadingIcon={<FolderOpen size={14} />}
                >
                  다운로드 폴더 열기
                </Button>
                {runningSessions > 0 && (
                  <span className="text-xs text-on-warning">⚠ 실행 중 Claude 세션 {runningSessions}개 — 설치 시 종료됩니다.</span>
                )}
              </div>
            ) : (
              <Button variant="primary" onClick={handleDownload} disabled={!result.downloadUrl} leadingIcon={<Download size={14} />}>
                다운로드
              </Button>
            )}

            {phase === 'error' && status?.error && <span className="text-sm text-on-danger">{status.error}</span>}
          </div>
        </FormField>
      ) : (
        phase === 'error' && status?.error && (
          <FormField label="확인 결과"><span className="text-sm text-on-danger">{status.error}</span></FormField>
        )
      )}

      <FormField
        label="자동 확인"
        hint="백그라운드에서 주기적으로 새 버전을 확인합니다. 다운로드·설치는 자동으로 하지 않습니다."
      >
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={cfg.enabled}
              onChange={(e) => handleSaveConfig(e.target.checked, cfg.intervalHours)}
            />
            <span className="text-sm text-secondary">활성화</span>
          </label>
          <select
            className={inputClass}
            style={{ width: 'auto' }}
            value={cfg.intervalHours}
            disabled={!cfg.enabled}
            onChange={(e) => handleSaveConfig(cfg.enabled, Number(e.target.value))}
          >
            {UPDATE_INTERVALS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {savedAt && <span className="text-sm text-on-success">저장되었습니다.</span>}
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
      setTestResult({ ok: false, message: '호스트 브릿지를 사용할 수 없습니다 (데스크톱 앱에서만 가능)' });
      return;
    }
    if (r.ok) setTestResult({ ok: true, message: '연결 성공' });
    else if (r.status === 401) setTestResult({ ok: false, message: 'API 키가 일치하지 않습니다 (HTTP 401)' });
    else if (r.status > 0) setTestResult({ ok: false, message: `서버 응답 오류: HTTP ${r.status}` });
    else setTestResult({ ok: false, message: r.error ?? '연결 실패 (네트워크 오류)' });
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
    <Section title="연결 방식">
      {!bridgeAvailable && (
        <p className="text-sm text-muted">
          데스크톱 앱에서만 변경할 수 있습니다. 브라우저(dev) 에서는 Local 모드로 동작합니다.
        </p>
      )}
      {bridgeAvailable && loaded && (
        <>
          <FormField label="모드" hint="Local 은 Atlas.exe 안에서 인프로세스로 동작. Client 는 원격 Atlas-Server 에 붙습니다.">
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
                    <Server size={14} /> Local (기본)
                  </span>
                  <span className="block text-xs text-muted">이 머신의 SQLite 파일에 직접 저장. 단일 사용자.</span>
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
                    <Plug size={14} /> Client (원격 서버 연결)
                  </span>
                  <span className="block text-xs text-muted">팀원과 공유. 서버 머신에서 Atlas-Server 가 떠 있어야 합니다.</span>
                </span>
              </label>
            </div>
          </FormField>

          {draft.mode === 'Client' && (
            <>
              <FormField label="서버 URL" hint="예: http://atlas.intranet:5200 (사내 LAN 평문 HTTP 가정)">
                <input
                  value={draft.serverUrl ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, serverUrl: e.target.value }))}
                  placeholder="http://host:5200"
                  className={inputClass}
                />
              </FormField>
              <FormField label="API 키" hint="서버 운영자가 공유한 공용 시크릿 (X-Atlas-Key 헤더). 비워두면 보내지 않습니다.">
                <input
                  type="password"
                  value={draft.apiKey ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
                  placeholder="(선택)"
                  className={inputClass}
                />
              </FormField>
              <FormField label="연결 테스트">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={handleTest}
                    disabled={testing || !draft.serverUrl}
                  >
                    {testing ? '테스트 중...' : '테스트'}
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
              {busy ? '저장 중' : '저장'}
            </Button>
            {savedAt && (
              <span className="text-xs text-on-warning">저장됨 — Atlas 를 재시작해야 적용됩니다.</span>
            )}
            {isDirty && !savedAt && (
              <span className="text-xs text-muted">변경 사항 있음</span>
            )}
          </div>
        </>
      )}
    </Section>
  );
}

function DataFolderSection() {
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

  const currentDisplay = savedPath ?? info?.current ?? '불러오는 중...';

  return (
    <>
      <Section title="데이터">
        <FormField
          label="저장 위치"
          hint="데이터베이스(projectmanager.db)와 프로젝트별 첨부 파일이 저장되는 폴더입니다. 변경 사항은 Atlas 재시작 후 적용됩니다."
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
                변경
              </Button>
              {!bridgeAvailable && (
                <span className="text-xs text-muted">데스크톱 앱에서만 변경 가능</span>
              )}
              {savedPath && (
                <span className="text-xs text-on-warning">변경됨 — Atlas 를 재시작해주세요</span>
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
        <h3 className="text-lg font-semibold">데이터 폴더 변경</h3>
        <code className="block bg-surface-2 px-2 py-1.5 rounded text-xs break-all">{path}</code>

        <div className="space-y-2 text-sm text-secondary">
          {!preview.exists && (
            <p>이 폴더는 아직 존재하지 않습니다. 저장 시 자동으로 생성됩니다.</p>
          )}
          {preview.exists && !preview.hasExistingDb && (
            <p>
              이 폴더에는 기존 Atlas 데이터가 없습니다. 그대로 진행하면 <strong>새 빈 데이터베이스</strong>로 시작됩니다.
              <br />
              기존 데이터를 옮기려면 먼저 현재 폴더의 <code>projectmanager.db</code> 와 프로젝트 하위 폴더들을 이 위치로 복사한 뒤 변경하세요.
            </p>
          )}
          {preview.hasExistingDb && (
            <p>
              이 폴더에서 기존 Atlas 데이터를 발견했습니다
              {preview.projectCount !== null && <> (프로젝트 {preview.projectCount}개)</>}.
              이 데이터를 사용하도록 전환합니다.
            </p>
          )}
          {preview.warnings.length > 0 && (
            <ul className="list-disc list-inside text-on-warning text-xs space-y-1">
              {preview.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          {blocked && (
            <p className="text-on-danger text-xs">쓰기 권한이 없어 이 폴더를 사용할 수 없습니다.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            취소
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={busy || blocked}>
            {busy ? '저장 중...' : '변경'}
          </Button>
        </div>
      </div>
    </div>
  );
}
