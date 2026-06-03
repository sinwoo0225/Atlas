import type { ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

interface Props {
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  error,
  onRetry,
  className = '',
}: Props) {
  const { t } = useTranslation();
  const isError = error != null && error !== false;

  const resolvedIcon = icon ?? (isError ? <AlertTriangle size={32} /> : undefined);
  const resolvedTitle = title ?? (isError ? t('loadFailed') : '');
  const resolvedDescription =
    description ??
    (isError ? (error instanceof Error ? error.message : String(error)) : undefined);
  const resolvedAction =
    action ??
    (isError && onRetry ? (
      <Button variant="secondary" size="sm" leadingIcon={<RotateCw size={14} />} onClick={onRetry}>
        {t('retry')}
      </Button>
    ) : undefined);

  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 ${className}`}>
      {resolvedIcon && (
        <div className={`mb-3 ${isError ? 'text-on-danger opacity-80' : 'text-muted opacity-60'}`}>
          {resolvedIcon}
        </div>
      )}
      {resolvedTitle && (
        <p className={`text-sm ${isError ? 'text-on-danger' : 'text-secondary'}`}>{resolvedTitle}</p>
      )}
      {resolvedDescription && (
        <p className="text-xs text-muted mt-1 max-w-sm break-words">{resolvedDescription}</p>
      )}
      {resolvedAction && <div className="mt-4">{resolvedAction}</div>}
    </div>
  );
}
