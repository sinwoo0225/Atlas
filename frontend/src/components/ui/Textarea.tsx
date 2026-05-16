import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
  fullWidth?: boolean;
  resizable?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { error, fullWidth = true, resizable = false, className = '', ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={`${fullWidth ? 'w-full' : ''} px-3 py-2 text-sm rounded-md transition-colors ${
        resizable ? '' : 'resize-none'
      } ${error ? 'border-on-danger' : ''} ${className}`}
      {...rest}
    />
  );
});
