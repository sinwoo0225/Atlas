import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle } from 'lucide-react';

/** 라벨 옆 '?' 도움말 아이콘 + hover/focus 시 뜨는 스타일 툴팁.
 *  네이티브 title 과 달리 앱 토큰을 따르고 키보드 focus 로도 열린다.
 *  말풍선은 position:absolute(z-50) — 상위에 overflow 클리핑 컨테이너가 없을 때 안전.
 *  (Modal Card/좌측 컬럼은 overflow 미설정이라 안 잘림.) */
export function InfoTip({ content }: { content: ReactNode }) {
  const { t } = useTranslation();
  return (
    <span className="relative inline-flex group align-middle">
      <button
        type="button"
        aria-label={t('common:help')}
        className="text-muted hover:text-secondary focus:text-secondary outline-none cursor-help"
      >
        <HelpCircle size={13} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full mt-1 z-50 w-56 rounded-md border border-default bg-surface-3 px-2 py-1.5 text-xs text-secondary normal-case font-normal leading-snug shadow-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
      >
        {content}
      </span>
    </span>
  );
}
