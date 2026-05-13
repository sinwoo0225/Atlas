import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';
type Size = 'sm' | 'md';

interface Props extends HTMLAttributes<HTMLSpanElement> {
  variant: BadgeVariant;
  size?: Size;
  children: ReactNode;
}

const variantCls: Record<BadgeVariant, string> = {
  success: 'bg-success-soft text-on-success',
  warning: 'bg-warning-soft text-on-warning',
  danger:  'bg-danger-soft text-on-danger',
  info:    'bg-info-soft text-on-info',
  neutral: 'bg-neutral-soft text-on-neutral',
  accent:  'bg-accent-soft text-accent',
};

const sizeCls: Record<Size, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
};

export function Badge({ variant, size = 'md', className = '', children, ...rest }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded font-medium ${variantCls[variant]} ${sizeCls[size]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}
