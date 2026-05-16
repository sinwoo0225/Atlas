import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';

type Size = 'sm' | 'md';

interface Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  inputSize?: Size;
  error?: boolean;
  fullWidth?: boolean;
}

const sizeCls: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-2 text-sm',
};

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { inputSize = 'md', error, fullWidth = true, className = '', children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={`${fullWidth ? 'w-full' : ''} ${sizeCls[inputSize]} rounded-md transition-colors ${
        error ? 'border-on-danger' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
});
