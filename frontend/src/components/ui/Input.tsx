import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

type Size = 'sm' | 'md';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  inputSize?: Size;
  error?: boolean;
  fullWidth?: boolean;
  /** leadingIcon/trailingIcon 사용 시 wrapper 에 별도 클래스 부여 (input 의 className 과 분리) */
  wrapperClassName?: string;
}

const sizeCls: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-2 text-sm',
};

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { leadingIcon, trailingIcon, inputSize = 'md', error, fullWidth = true, className = '', wrapperClassName = '', ...rest },
  ref,
) {
  if (!leadingIcon && !trailingIcon) {
    // 아이콘 없으면 input 자체에 모든 클래스. className 으로 width 등 자유 제어.
    const cls = `${fullWidth ? 'w-full' : ''} ${sizeCls[inputSize]} rounded-md transition-colors ${
      error ? 'border-on-danger' : ''
    } ${className}`;
    return <input ref={ref} className={cls} {...rest} />;
  }

  // 아이콘 있으면 wrapper 가 layout (width/margin 등) 담당, input 은 wrapper 내부 채움.
  const inputCls = `w-full ${sizeCls[inputSize]} rounded-md transition-colors ${
    error ? 'border-on-danger' : ''
  } ${leadingIcon ? 'pl-7' : ''} ${trailingIcon ? 'pr-7' : ''} ${className}`;
  const wrapperCls = `relative ${fullWidth ? 'w-full' : ''} ${wrapperClassName}`;

  return (
    <div className={wrapperCls}>
      {leadingIcon && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none flex items-center">
          {leadingIcon}
        </span>
      )}
      <input ref={ref} className={inputCls} {...rest} />
      {trailingIcon && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none flex items-center">
          {trailingIcon}
        </span>
      )}
    </div>
  );
});
