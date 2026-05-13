import type { ReactNode } from 'react';

interface Props {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = '' }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 ${className}`}>
      {icon && <div className="text-muted mb-3 opacity-60">{icon}</div>}
      <p className="text-sm text-secondary">{title}</p>
      {description && <p className="text-xs text-muted mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
