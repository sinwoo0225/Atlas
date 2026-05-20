import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { Save, Settings as SettingsIcon, FolderOpen, Server, Plug, Keyboard, Sparkles } from 'lucide-react';
import { openShortcutsModal } from '../data/shortcuts';
import { aiApi } from '../api/ai';
import {
  loadSettings,
  saveSettings,
  applyTheme,
  applyMarkdownStyle,
  MARKDOWN_FONT_SIZE_RANGE,
  MARKDOWN_LINE_HEIGHT_RANGE,
  type AppSettings,
  type ThemeMode,
} from '../store/settings';
import { useProjectStore } from '../store/useProjectStore';
import { Button, Card, FormField, Spinner, inputClass } from '../components/ui';
import { confirmDialog } from '../components/ui/ConfirmDialog';
import { systemApi, type DataFolderInfo, type DataFolderPreview } from '../api/system';
import {
  pickFolder,
  isHostBridgeAvailable,
  getConnectionConfig,
  setConnectionConfig,
  testServerConnection,
  type ConnectionConfig,
  type ConnectionMode,
} from '../utils/hostBridge';

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

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    applyMarkdownStyle(settings.markdownFontSize, settings.markdownLineHeight);
  }, [settings.markdownFontSize, settings.markdownLineHeight]);

  const update = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => {
    setSettings((s) => ({ ...s, [k]: v }));
  };

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
      message: '모든 설정을 초기 상태로 되돌립니다. 테마, 작성자 이름, 마지막 프로젝트 등이 사라집니다.',
      confirmLabel: '초기화',
      danger: true,
    })) return;
    localStorage.removeItem('pm-hub-settings');
    const fresh = loadSettings();
    setSettings(fresh);
    applyTheme(fresh.theme);
    applyMarkdownStyle(fresh.markdownFontSize, fresh.markdownLineHeight);
  };

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
            {(['dark', 'light'] as ThemeMode[]).map((t) => (
              <Button
                key={t}
                variant={settings.theme === t ? 'primary' : 'secondary'}
                size="md"
                onClick={() => update('theme', t)}
              >
                {t === 'dark' ? '다크' : '라이트'}
              </Button>
            ))}
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
        <FormField
          label="회의록 'AI 요약' 버튼 표시"
          hint="로컬에 Claude Code CLI(claude)가 설치·로그인돼 있어야 동작합니다. 회의록 논의내용을 claude 로 요약합니다."
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
      {connectionMode === 'Client' && (
        <Section title="데이터">
          <p className="text-sm text-secondary">
            Client 모드에서는 데이터 폴더를 서버가 관리합니다. 서버 측 <code>%LOCALAPPDATA%\Atlas\config.json</code> 의
            <code> dataFolder </code> 를 편집해 변경하세요.
          </p>
        </Section>
      )}

      <Section title="초기화">
        <FormField
          label="설정 초기화"
          hint="테마, 마지막 선택 프로젝트 등이 기본값으로 돌아갑니다. (DB 데이터에는 영향 없음)"
        >
          <Button variant="danger" onClick={handleReset}>설정 초기화</Button>
        </FormField>
      </Section>
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
