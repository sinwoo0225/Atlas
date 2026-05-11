import { useEffect, useState } from 'react';
import { Save, Settings as SettingsIcon } from 'lucide-react';
import {
  loadSettings,
  saveSettings,
  applyTheme,
  type AppSettings,
  type ThemeMode,
} from '../store/settings';
import { useProjectStore } from '../store/useProjectStore';

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings());
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const { projects } = useProjectStore();

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

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
  };

  const lastProject = projects.find((p) => p.id === settings.lastProjectId);

  const inputClass =
    'w-full bg-zinc-800/60 border border-zinc-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-zinc-500';

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <SettingsIcon size={18} className="text-slate-400" />
          설정
        </h1>
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-sm text-emerald-400">저장되었습니다.</span>}
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-md text-sm font-medium transition-colors"
          >
            <Save size={14} /> 저장
          </button>
        </div>
      </div>

      <Section title="외관">
        <Field label="테마">
          <div className="flex gap-2">
            {(['dark', 'light'] as ThemeMode[]).map((t) => (
              <button
                key={t}
                onClick={() => update('theme', t)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  settings.theme === t
                    ? 'bg-zinc-700 text-white'
                    : 'bg-zinc-800 text-slate-300 hover:bg-zinc-700'
                }`}
              >
                {t === 'dark' ? '다크' : '라이트'}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-1">라이트 테마는 일부 페이지에서 다크 위주로 디자인되어 있어 가독성이 떨어질 수 있습니다.</p>
        </Field>
      </Section>

      <Section title="기본 동작">
        <Field label="앱 시작 시 마지막 프로젝트 자동 선택">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoSelectLastProject}
              onChange={(e) => update('autoSelectLastProject', e.target.checked)}
            />
            <span className="text-sm text-slate-300">활성화</span>
          </label>
          <p className="text-xs text-slate-500 mt-1">
            마지막으로 본 프로젝트: {lastProject ? lastProject.name : '없음'}
          </p>
        </Field>

        <Field label="기본 작성자 이름">
          <input
            value={settings.defaultAuthor}
            onChange={(e) => update('defaultAuthor', e.target.value)}
            placeholder="변경 이력/회의록 등에 미리 채워질 이름"
            className={inputClass}
          />
        </Field>
      </Section>

      <Section title="데이터">
        <Field label="저장 위치">
          <p className="text-sm text-slate-300">
            데이터베이스 및 프로젝트 파일은 <code className="bg-zinc-800 px-1 py-0.5 rounded">{'%USERPROFILE%/Documents/ProjectManager'}</code> 폴더에 저장됩니다.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            프로젝트 백업은 프로젝트 목록 또는 대시보드에서 수행할 수 있습니다.
          </p>
        </Field>
      </Section>

      <Section title="초기화">
        <Field label="설정 초기화">
          <button
            onClick={handleReset}
            className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded-md text-sm transition-colors"
          >
            설정 초기화
          </button>
          <p className="text-xs text-slate-500 mt-1">테마, 마지막 선택 프로젝트 등이 기본값으로 돌아갑니다. (DB 데이터에는 영향 없음)</p>
        </Field>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg p-5">
      <h2 className="text-sm font-medium text-slate-200 mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-2">{label}</label>
      {children}
    </div>
  );
}
