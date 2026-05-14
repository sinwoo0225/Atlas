import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Save, Settings as SettingsIcon } from 'lucide-react';
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

      <Section title="데이터">
        <FormField
          label="저장 위치"
          hint="프로젝트 백업은 프로젝트 목록 또는 대시보드에서 수행할 수 있습니다."
        >
          <p className="text-sm text-secondary">
            데이터베이스 및 프로젝트 파일은 <code className="bg-surface-2 px-1 py-0.5 rounded">{'%USERPROFILE%/Documents/ProjectManager'}</code> 폴더에 저장됩니다.
          </p>
        </FormField>
      </Section>

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
