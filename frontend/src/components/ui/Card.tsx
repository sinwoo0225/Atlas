import type { HTMLAttributes, ReactNode } from 'react';

type Padding = 'tight' | 'normal' | 'spacious' | 'none';
type Variant = 'default' | 'subtle';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: Padding;
  variant?: Variant;
  children: ReactNode;
}

const padCls: Record<Padding, string> = {
  none:     '',
  tight:    'p-3',
  normal:   'p-4',
  spacious: 'p-6',
};

const variantCls: Record<Variant, string> = {
  default: 'bg-surface border-default',
  subtle:  'bg-surface-2 border-default',
};

export function Card({ padding = 'normal', variant = 'default', className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={`border rounded-lg ${variantCls[variant]} ${padCls[padding]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
