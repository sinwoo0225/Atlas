import type { HTMLAttributes, ReactNode, Ref } from 'react';

type Padding = 'tight' | 'normal' | 'spacious' | 'none';
type Variant = 'default' | 'subtle';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: Padding;
  variant?: Variant;
  children: ReactNode;
  // Card 를 스크롤 컨테이너로 쓸 때 필요 (React 19 는 함수 컴포넌트도 ref 를 일반 prop 으로 받는다).
  ref?: Ref<HTMLDivElement>;
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

export function Card({ padding = 'normal', variant = 'default', className = '', children, ref, ...rest }: CardProps) {
  return (
    <div
      ref={ref}
      className={`border rounded-lg ${variantCls[variant]} ${padCls[padding]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
