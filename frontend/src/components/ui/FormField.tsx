import type { ReactNode } from 'react';

interface Props {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function FormField({ label, hint, error, required, className = '', children }: Props) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-xs text-muted font-medium">
        {label}
        {required && <span className="text-on-danger ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-on-danger">{error}</p>}
    </div>
  );
}

/** 페이지에서 직접 <input>·<select>·<textarea> 을 쓸 때 공통 className.
 *  index.css 의 글로벌 input/select/textarea 스타일을 이미 받으므로 추가 시각은 거의 없고,
 *  Tailwind 유틸로 width/패딩만 부여한다.
 */
export const inputClass =
  'w-full px-3 py-2 text-sm rounded-md transition-colors';
