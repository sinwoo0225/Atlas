import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
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
import { systemApi, type DataFolderInfo, type DataFolderPreview, type BackupConfig, type BackupStatus } from '../api/system';
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

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings());
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode | null>(null);
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
      if (r.available) toast.success(`Claude CLI 연결 OK${r.sample ? ` — "${r.sample.slice(0, 40)}"` : ''}`);
      else toast.error(r.error || 'Claude CLI 호출 실패');
    } catch {
      toast.error('Claude CLI 테스트 실패 — 백엔드/CLI 설치 확인');
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
      title: '설정 초기화',
      message: '모든 설정을 초기 상태로 되돌립니다. 테마·커스텀 색·브랜드·아이콘·작성자 이름·마지막 프로젝트 등이 사라집니다.',
      confirmLabel: '초기화',
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
      toast.success('설정을 가져왔습니다.');
    } catch {
      toast.error('가져오기 실패 — 올바른 atlas-settings.json 인지 확인하세요.');
    }
  };

  // 앱(작업표시줄/창) 아이콘 — 이미지를 data URL 로 읽어 brandIcon 에 저장.
  const brandIconInputRef = useRef<HTMLInputElement>(null);
  const handleBrandIconFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl.startsWith('data:image/')) {
        toast.error('이미지 파일만 사용할 수 있습니다.');
        return;
      }
      if (dataUrl.length > 256 * 1024) {
        toast.warning('아이콘이 큽니다(>256KB). 작은 PNG/ICO 를 권장합니다.');
      }
      update('brandIcon', dataUrl);
    };
    reader.onerror = () => toast.error('이미지를 읽지 못했습니다.');
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
      toast.error('프리셋 아이콘을 불러오지 못했습니다.');
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
          설정
        </h1>
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-sm text-on-success">저장되었습니다.</span>}
          <Button variant="primary" onClick={handleSave} leadingIcon={<Save size={16} />}>
            저장
          </Button>
        </div>
      </div>

      <Section title="외관">
        <FormField label="테마">
          <div className="flex gap-2">
            {(['dark', 'light', 'custom'] as ThemeMode[]).map((t) => (
              <Button
                key={t}
                variant={settings.theme === t ? 'primary' : 'secondary'}
                size="md"
                onClick={() => update('theme', t)}
              >
                {t === 'dark' ? '다크' : t === 'light' ? '라이트' : '커스텀'}
              </Button>
            ))}
          </div>
        </FormField>

        {settings.theme === 'custom' && (
          <FormField
            label="커스텀 색상 (12종)"
            hint="핵심 12색을 지정하면 나머지 톤(표면 단계·muted·soft 배경·포커스링 등)은 자동 파생됩니다."
          >
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Button variant="secondary" size="sm" onClick={() => seedColors(DARK_BASE)} leadingIcon={<Palette size={13} />}>
                  다크에서 시드
                </Button>
                <Button variant="secondary" size="sm" onClick={() => seedColors(LIGHT_BASE)} leadingIcon={<Palette size={13} />}>
                  라이트에서 시드
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

      <Section title="브랜드">
        <FormField
          label="워드마크"
          hint="사이드바 로고. 두 부분으로 나뉘어 각각 다른 색으로 표시됩니다. (접힌 사이드바는 각 첫 글자)"
        >
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <div className="text-xs text-muted mb-1">앞부분 (primary)</div>
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
                  aria-label="앞부분 색"
                />
              </div>
            </div>
            <div>
              <div className="text-xs text-muted mb-1">뒷부분 (accent)</div>
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
                  aria-label="뒷부분 색"
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
              로고 색 기본값
            </Button>
          </div>
        </FormField>
        <FormField label="탭/창 제목" hint="브라우저 탭과 데스크톱 앱 창의 제목으로 사용됩니다. (저장 시 적용)">
          <input
            value={settings.brandTitle}
            onChange={(e) => update('brandTitle', e.target.value)}
            placeholder="Atlas"
            className={`${inputClass} w-48`}
          />
        </FormField>
        <FormField
          label="앱 아이콘 (작업표시줄)"
          hint="실행 중 작업표시줄·창 아이콘으로 쓰입니다. 작은 PNG/ICO 권장(SVG 미지원). exe 파일 자체 아이콘과 작업표시줄 고정 아이콘은 바뀌지 않습니다."
        >
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-md border border-default bg-surface-2 flex items-center justify-center overflow-hidden shrink-0">
              {settings.brandIcon
                ? <img src={settings.brandIcon} alt="앱 아이콘" className="w-full h-full object-contain" />
                : <span className="text-[10px] text-muted">기본</span>}
            </div>
            <Button
              variant="secondary"
              size="md"
              onClick={() => brandIconInputRef.current?.click()}
              leadingIcon={<Upload size={14} />}
            >
              이미지 선택
            </Button>
            {settings.brandIcon && (
              <Button variant="ghost" size="sm" leadingIcon={<RotateCcw size={13} />} onClick={() => update('brandIcon', '')}>
                기본으로
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
            <div className="text-xs text-muted mb-1.5">프리셋에서 선택</div>
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

      <Section title="마크다운 뷰어">
        <FormField
          label={`글자 크기 — ${settings.markdownFontSize}px`}
          hint="회의록·일지·WBS 상세 등 마크다운 렌더링에 즉시 반영됩니다."
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
        <FormField label={`줄간격 — ${settings.markdownLineHeight.toFixed(2)}`}>
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
        <FormField label="미리보기">
          <div className="markdown-body bg-surface-2 border border-default rounded-md px-3 py-2">
            <ReactMarkdown>{
`# 회의록 샘플

이 문단은 **현재 글자 크기**와 *줄간격*을 미리 보여줍니다. 본문 가독성이 화면 거리·해상도에 맞는지 슬라이더로 조정해보세요.

- 한 항목 — 결정 사항 또는 메모.
- 두 번째 항목 — \`코드 인라인\` 도 포함.
`
            }</ReactMarkdown>
          </div>
        </FormField>
      </Section>

      <Section title="기본 동작">
        <FormField
          label="앱 시작 시 마지막 프로젝트 자동 선택"
          hint={`마지막으로 본 프로젝트: ${lastProject ? lastProject.name : '없음'}`}
        >
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoSelectLastProject}
              onChange={(e) => update('autoSelectLastProject', e.target.checked)}
            />
            <span className="text-sm text-secondary">활성화</span>
          </label>
        </FormField>

        <FormField label="기본 작성자 이름">
          <input
            value={settings.defaultAuthor}
            onChange={(e) => update('defaultAuthor', e.target.value)}
            placeholder="변경 이력/회의록 등에 미리 채워질 이름"
            className={inputClass}
          />
        </FormField>
      </Section>

      <Section title="키보드 단축키">
        <FormField
          label="단축키 도움말"
          hint="모든 페이지에서 ? 키로도 열 수 있습니다."
        >
          <Button variant="secondary" onClick={openShortcutsModal} leadingIcon={<Keyboard size={14} />}>
            도움말 보기 (?)
          </Button>
        </FormField>
      </Section>

      <Section title="AI 요약 (로컬 Claude Code)">
        <div className="flex items-start gap-2 rounded-md bg-warning-soft border border-default px-3 py-2">
          <AlertTriangle size={15} className="text-on-warning shrink-0 mt-0.5" />
          <div className="text-xs text-on-warning space-y-1">
            <p><strong>사용 시 추가 요금이 발생할 수 있습니다.</strong> 요약은 Claude 구독·API 사용량을 소모합니다.</p>
            <p className="text-secondary">
              로컬에 설치된 <code>claude</code> CLI 를 <code>claude -p</code> (print 모드, 프롬프트는 stdin 전달) 로 호출해 요약을 생성합니다.
              CLI 가 설치·로그인돼 있어야 동작합니다.
            </p>
          </div>
        </div>
        <FormField
          label="회의록 'AI 요약' 버튼 표시"
          hint="회의록 논의내용을 claude 로 요약하는 버튼을 회의록 폼에 노출합니다."
        >
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.aiSummaryEnabled}
              onChange={(e) => update('aiSummaryEnabled', e.target.checked)}
            />
            <span className="text-sm text-secondary">활성화 (저장 후 적용)</span>
          </label>
        </FormField>
        <FormField label="연결 테스트" hint="claude CLI 를 한 번 호출해 설치·인증·응답을 확인합니다.">
          <Button variant="secondary" onClick={handleClaudeTest} disabled={aiTesting} leadingIcon={<Sparkles size={14} />}>
            {aiTesting ? '테스트 중…' : '테스트'}
          </Button>
        </FormField>
      </Section>

      <ConnectionModeSection onModeChanged={setConnectionMode} />

      {connectionMode === 'Local' && <DataFolderSection />}
      {connectionMode === 'Local' && <AutoBackupSection />}
      {connectionMode === 'Client' && (
        <Section title="데이터">
          <p className="text-sm text-secondary">
            Client 모드에서는 데이터 폴더를 서버가 관리합니다. 서버 측 <code>%LOCALAPPDATA%\Atlas\config.json</code> 의
            <code> dataFolder </code> 를 편집해 변경하세요.
          </p>
        </Section>
      )}

      <Section title="아이콘">
        <FormField label="메뉴 아이콘" hint="사이드바 내비게이션 아이콘. 클릭해 교체할 수 있습니다.">
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
        <FormField label="엔티티 아이콘" hint="활동 피드·검색 결과의 항목 종류 아이콘.">
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

      <Section title="설정 백업">
        <FormField
          label="저장 위치"
          hint="앱 설정(외관·브랜드·아이콘·AI 토글 등)은 브라우저 localStorage 키 pm-hub-settings 에 저장됩니다."
        >
          <p className="text-xs text-muted leading-relaxed">
            데스크톱 앱에서는 이 값이 <code>%LOCALAPPDATA%\Atlas\WebView2\</code> 내부 LevelDB(바이너리)에 들어 있어
            탐색기에서 직접 파일로 보이지 않습니다. <code>%LOCALAPPDATA%\Atlas\config.json</code> 은 연결/데이터폴더
            설정만 담고, 실제 DB·첨부파일은 데이터 폴더(<code>Documents\ProjectManager\</code> 등)에 있습니다.
            아래 내보내기로 설정을 파일로 백업·이전할 수 있습니다.
          </p>
        </FormField>
        <FormField label="내보내기 / 가져오기">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="secondary" size="md" onClick={handleExport} leadingIcon={<Download size={14} />}>
              내보내기
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => fileInputRef.current?.click()}
              leadingIcon={<Upload size={14} />}
            >
              가져오기
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

      <Section title="초기화">
        <FormField
          label="설정 초기화"
          hint="테마·커스텀 색·브랜드·아이콘·마지막 선택 프로젝트 등이 기본값으로 돌아갑니다. (DB 데이터에는 영향 없음)"
        >
          <Button variant="danger" onClick={handleReset}>설정 초기화</Button>
        </FormField>
      </Section>

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
  const [q, setQ] = useState('');
  const filtered = q.trim()
    ? SELECTABLE_ICONS.filter((n) => n.toLowerCase().includes(q.trim().toLowerCase()))
    : SELECTABLE_ICONS;

  return (
    <Modal open onClose={onClose} title="아이콘 선택" size="lg" showCloseButton>
      <div className="space-y-3">
        <div className="relative">
          <SearchIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="아이콘 검색 (영문 이름)"
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
            <p className="col-span-full text-sm text-muted py-4 text-center">일치하는 아이콘이 없습니다.</p>
          )}
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" leadingIcon={<RotateCcw size={13} />} onClick={onReset}>
            기본값으로
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
