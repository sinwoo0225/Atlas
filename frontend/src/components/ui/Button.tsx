import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const variantCls: Record<Variant, string> = {
  primary:   'bg-accent hover:bg-accent-hover text-on-accent border-transparent',
  secondary: 'bg-surface-2 hover:bg-surface-3 text-secondary hover:text-primary border-default',
  ghost:     'bg-transparent hover:bg-surface-2 text-secondary hover:text-primary border-transparent',
  danger:    'bg-red-600 hover:bg-red-500 text-white border-transparent',
};

const sizeCls: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs gap-1.5',
  md: 'px-3 py-1.5 text-sm gap-2',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', leadingIcon, trailingIcon, className = '', children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center whitespace-nowrap shrink-0 rounded-md font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantCls[variant]} ${sizeCls[size]} ${className}`}
      {...rest}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
});
