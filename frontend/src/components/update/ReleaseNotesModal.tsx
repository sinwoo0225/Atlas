import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui/Modal';
import { Markdown } from '../ui/Markdown';
import { systemApi } from '../../api/system';
import { useReleaseNotesModal } from '../../store/useReleaseNotesModal';

// 릴리즈 노트 모달 — MainShell 에 1회 마운트. 알림 토스트/종 패널·설정에서 store 로 연다.
// 본문은 열릴 때 systemApi.getUpdateStatus() 의 releaseNotes(=GitHub release body)를 가져와
// 마크다운으로 렌더한다. 설정 화면이 raw pre-wrap 텍스트로 보여주던 것도 이걸로 대체된다.
export function ReleaseNotesModalHost() {
  const { t } = useTranslation();
  const { open, version, close } = useReleaseNotesModal();
  const [notes, setNotes] = useState<string | null>(null);
  const [resolvedVersion, setResolvedVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
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
  }, [open, version]);

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
