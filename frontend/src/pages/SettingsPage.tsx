import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Save, Settings as SettingsIcon, FolderOpen } from 'lucide-react';
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
import { Button, Card, FormField, inputClass } from '../components/ui';
import { systemApi, type DataFolderInfo, type DataFolderPreview } from '../api/system';
import { pickFolder, isHostBridgeAvailable } from '../utils/hostBridge';

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings());
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const { projects } = useProjectStore();

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    applyMarkdownStyle(settings.markdownFontSize, settings.markdownLineHeight);
  }, [settings.markdownFontSize, settings.markdownLineHeight]);

  const update = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => {
    setSettings((s) => ({ ...s, [k]: v }));
  };

  const handleSave = () => {
    saveSettings(settings);
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2000);
  };

  const handleReset = () => {
    if (!confirm('모든 설정을 초기화하시겠습니까?')) return;
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
        <FormField
          label="테마"
          hint="라이트 테마는 일부 페이지에서 다크 위주로 디자인되어 있어 가독성이 떨어질 수 있습니다."
        >
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

      <DataFolderSection />

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
