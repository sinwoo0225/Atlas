import type { ReactNode } from 'react';
import { InfoTip } from './InfoTip';

interface Props {
  label: ReactNode;
  hint?: ReactNode;
  /** 라벨 옆 '?' 아이콘 툴팁. hint(필드 아래 텍스트)와 달리 공간을 안 먹는다. */
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function FormField({ label, hint, help, error, required, className = '', children }: Props) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-xs text-muted font-medium flex items-center gap-1">
        {label}
        {required && <span className="text-on-danger ml-0.5">*</span>}
        {help && <InfoTip content={help} />}
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

/** inputClass 와 동일하지만 `w-full` 을 빼서, 호출 측에서 `w-32` / `w-36` 등 고정 너비를 지정할 때
 *  뒤에 붙인 너비 유틸이 묻히지 않게 한다 (둘 다 utility 라 specificity 가 같아 CSS 출력 순서가 결정 — w-full 이 보통 이긴다). */
export const inputClassNoW =
  'px-3 py-2 text-sm rounded-md transition-colors';

/** 필터바 인라인 입력(검색·날짜·셀렉트)을 토글 버튼(Button size="sm")과 같은 높이로 맞출 때.
 *  Button sm 의 px-2.5 py-1 text-xs 와 동일 패딩. inputClassNoW 와 섞지 말 것(py-2 충돌). */
export const inputClassSm =
  'px-2.5 py-1 text-xs rounded-md transition-colors';
