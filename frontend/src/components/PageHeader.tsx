import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

interface Props {
  icon?: ReactNode;
  title: ReactNode;
  /** 좌측 breadcrumb 라벨 — 보통 프로젝트명. title 앞에 chevron 으로 연결 */
  breadcrumb?: ReactNode;
  /** 우측 액션 영역 — Button 등 */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ icon, title, breadcrumb, actions, className = '' }: Props) {
  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      <h1 className="h-page flex items-center gap-2 min-w-0">
        {icon && <span className="text-muted shrink-0 flex items-center">{icon}</span>}
        {breadcrumb && (
          <>
            <span className="text-muted truncate">{breadcrumb}</span>
            <ChevronRight size={14} className="text-muted shrink-0" />
          </>
        )}
        <span className="truncate">{title}</span>
      </h1>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
