import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Save, LayoutTemplate } from 'lucide-react';
import { Button, Modal, FormField, inputClass } from '../../components/ui';
import type { Project, ProjectCategory, ProjectStatus } from '../../types';

// 라벨은 status 네임스페이스 재사용 — 렌더 시점 t(labelKey).
const statusOptions: { value: ProjectStatus; labelKey: string }[] = [
  { value: 'Waiting', labelKey: 'status:project.Waiting' },
  { value: 'InProgress', labelKey: 'status:project.InProgress' },
  { value: 'Done', labelKey: 'status:project.Done' },
  { value: 'Maintenance', labelKey: 'status:project.Maintenance' },
];

// 카테고리는 저장 데이터값(한글 enum)이라 그대로 노출(범위 밖) — Phase 2 후속에서 표시 매핑 검토.
const categoryOptions: ProjectCategory[] = ['과제', '내부', '사업'];

export type ProjectSaveData = Omit<Project, 'id' | 'folderPath' | 'createdAt' | 'updatedAt'>;

export function ProjectForm({
  initial,
  onSave,
  onSaveWithTemplate,
  onCancel,
}: {
  initial?: Partial<Project>;
  onSave: (data: ProjectSaveData) => void;
  // 생성 모드에서만 — 프로젝트 생성 후 템플릿 선택 플로우로 이어감.
  onSaveWithTemplate?: (data: ProjectSaveData) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const initialForm = {
    name: initial?.name ?? '',
    category: initial?.category ?? '',
    description: initial?.description ?? '',
    goal: initial?.goal ?? '',
    status: (initial?.status ?? 'Waiting') as ProjectStatus,
    startDate: initial?.startDate?.slice(0, 10) ?? '',
    endDate: initial?.endDate?.slice(0, 10) ?? '',
    budget: initial?.budget?.toString() ?? '',
    participants: initial?.participants ?? '',
    deliverables: initial?.deliverables ?? '',
    relatedLinks: initial?.relatedLinks ?? '',
    gitRepoPath: initial?.gitRepoPath ?? '',
    completedDate: initial?.completedDate?.slice(0, 10) ?? '',
  };
  const [form, setForm] = useState(initialForm);
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // gitRepoPath 는 더 이상 프로젝트 폼에서 편집하지 않는다 — git 이력은 '업무 정보'(GitRepo 타입)로 이전됨.
  // 다만 기존 값 보존을 위해 initialForm/buildPayload 의 ...form 스프레드로 그대로 라운드트립한다
  // (ProjectService.UpdateAsync 가 null→empty 코얼레스라 payload 에서 빼면 컬럼이 비워짐).
  const buildPayload = () => ({
    ...form,
    budget: form.budget ? parseFloat(form.budget) : undefined,
    startDate: form.startDate || undefined,
    endDate: form.endDate || undefined,
    completedDate: form.completedDate || undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 폼 문자열 budget/date 를 변환한 payload, onSave 타입과 구조 동일
  } as any);

  const handleSave = () => onSave(buildPayload());

  return (
    <Modal
      open
      onClose={onCancel}
      title={initial?.id ? t('projects:form.editTitle') : t('projects:form.newTitle')}
      size="xl"
      fixedHeight
      dirty={dirty}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} leadingIcon={<X size={16} />}>
            {t('common:cancel')}
          </Button>
          {onSaveWithTemplate && (
            <Button variant="secondary" onClick={() => onSaveWithTemplate(buildPayload())} leadingIcon={<LayoutTemplate size={16} />}>
              {t('projects:form.startFromTemplate')}
            </Button>
          )}
          <Button variant="primary" onClick={handleSave} leadingIcon={<Save size={16} />}>
            {t('common:save')}
          </Button>
        </>
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-full">
          {/* 좌측 - 기본 정보 */}
          <div className="space-y-3">
            <FormField label={t('projects:form.category')}>
              <select value={form.category} onChange={(e) => set('category', e.target.value)} className={inputClass}>
                <option value="">{t('projects:form.categoryNone')}</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </FormField>
            <FormField label={t('projects:form.name')} required>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
            </FormField>
            <FormField label={t('projects:form.status')}>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputClass}>
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                ))}
              </select>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t('projects:form.startDate')}>
                <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputClass} />
              </FormField>
              <FormField label={t('projects:form.endDate')}>
                <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className={inputClass} />
              </FormField>
            </div>
            <FormField label={t('projects:form.completedDate')} hint={t('projects:form.completedHint')}>
              <input type="date" value={form.completedDate} onChange={(e) => set('completedDate', e.target.value)} className={inputClass} />
            </FormField>
            <FormField label={t('projects:form.budget')}>
              <input type="number" value={form.budget} onChange={(e) => set('budget', e.target.value)} className={inputClass} />
            </FormField>
            <FormField label={t('projects:form.participants')}>
              <input value={form.participants} onChange={(e) => set('participants', e.target.value)} className={inputClass} />
            </FormField>
            <FormField label={t('projects:form.deliverables')}>
              <input value={form.deliverables} onChange={(e) => set('deliverables', e.target.value)} className={inputClass} />
            </FormField>
            <FormField label={t('projects:form.relatedLinks')}>
              <input value={form.relatedLinks} onChange={(e) => set('relatedLinks', e.target.value)} className={inputClass} />
            </FormField>
          </div>

          {/* 우측 - 긴 텍스트. 설명 textarea 가 남은 세로 공간 채움 */}
          <div className="flex flex-col gap-3 min-h-0">
            <FormField label={t('projects:form.goal')} className="shrink-0">
              <textarea
                value={form.goal}
                onChange={(e) => set('goal', e.target.value)}
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </FormField>
            <FormField label={t('projects:form.description')} className="flex-1 flex flex-col min-h-0">
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                className={`${inputClass} resize-none flex-1 min-h-0`}
              />
            </FormField>
          </div>
        </div>
      </div>
    </Modal>
  );
}
