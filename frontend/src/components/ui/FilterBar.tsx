import type { HTMLAttributes, ReactNode } from 'react';

interface FilterBarProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

// 리스트 페이지의 필터/검색/세그먼트 컨트롤을 담는 '툴바 밴드'. bare flex 행을 surface+테두리
// 밴드로 감싸 페이지(bg-base) 위에서 '컨트롤 존'으로 또렷이 분리 → 아래 데이터 영역과 시각 구분.
// 밴드 배경은 bg-surface(데이터 카드와 동일 톤이지만 한 줄 풀폭 bordered 밴드라 레이아웃으로 분리).
// surface-2 금지: input/select/textarea 기본 배경이 surface-2 라 밴드가 surface-2 면 컨트롤이 묻힘 —
// surface 밴드 안에서 surface-2 컨트롤이 떠오르는 게 핵심.
// 다중 행이 필요하면 className="flex-col items-stretch" 로 세로 스택하고 각 행을 자식 div 로.
export function FilterBar({ children, className = '', ...rest }: FilterBarProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 bg-surface border border-default rounded-lg px-3 py-2.5 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
