interface Props {
  visible: boolean;
  className?: string;
}

// 인플레이스 편집의 "변경됐지만 미저장" 시각 신호. opacity 0 일 때도 layout 차지 → 점프 없음.
export function DirtyDot({ visible, className = '' }: Props) {
  return (
    <span
      aria-label={visible ? '저장 안 된 변경사항' : undefined}
      aria-hidden={!visible}
      className={`inline-block w-1.5 h-1.5 rounded-full bg-accent transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'} ${className}`}
    />
  );
}
