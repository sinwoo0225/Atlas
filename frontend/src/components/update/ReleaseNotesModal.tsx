import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui/Modal';
import { Markdown } from '../ui/Markdown';
import { systemApi } from '../../api/system';
import { useReleaseNotesModal } from '../../store/useReleaseNotesModal';

// 릴리즈 노트 모달 — MainShell 에 1회 마운트.
//  - bundled 가 있으면(설정 '이 버전의 새로운 기능') 그대로 표시 → fetch 없음, 오프라인·Store 동작.
//  - 없으면(업데이트 알림) systemApi.getUpdateStatus() 의 releaseNotes(=GitHub release body)를 받아 표시.
export function ReleaseNotesModalHost() {
  const { t } = useTranslation();
  const { open, version, bundled, close } = useReleaseNotesModal();
  const [notes, setNotes] = useState<string | null>(null);
  const [resolvedVersion, setResolvedVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    // 번들 노트: 즉시 표시(네트워크 없음).
    if (bundled != null) {
      setNotes(bundled);
      setResolvedVersion(version);
      setLoading(false);
      return;
    }

    // 업데이트 노트: GitHub 상태에서 받아온다(온라인).
    let alive = true;
    setLoading(true);
    setNotes(null);
    systemApi.getUpdateStatus()
      .then((s) => {
        if (!alive) return;
        setNotes(s.lastResult?.releaseNotes ?? null);
        setResolvedVersion(s.lastResult?.latestVersion ?? version);
      })
      .catch(() => { if (alive) setNotes(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, version, bundled]);

  const title = resolvedVersion
    ? t('update.releaseNotesTitleVersion', { version: resolvedVersion })
    : t('update.releaseNotesTitle');

  return (
    <Modal open={open} onClose={close} title={title} size="xxl" fixedHeight showCloseButton>
      <div className="markdown-body markdown-body--wide flex-1 min-h-0 overflow-auto text-sm leading-relaxed">
        {loading && <p className="text-secondary">{t('common:loading')}</p>}
        {!loading && notes && <Markdown>{notes}</Markdown>}
        {!loading && !notes && <p className="text-muted">{t('update.releaseNotesEmpty')}</p>}
      </div>
    </Modal>
  );
}
