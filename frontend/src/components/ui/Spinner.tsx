import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  size?: 'sm' | 'md';
  label?: ReactNode;
  className?: string;
}

const iconSize = { sm: 14, md: 18 };

export function Spinner({ size = 'md', label, className = '' }: Props) {
  return (
    <div className={`inline-flex items-center gap-2 text-muted text-sm ${className}`} role="status" aria-live="polite">
      <Loader2 size={iconSize[size]} className="animate-spin" />
      {label && <span>{label}</span>}
    </div>
  );
}
