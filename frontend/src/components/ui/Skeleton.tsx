import type { CSSProperties } from 'react';

interface Props {
  width?: string | number;
  height?: string | number;
  className?: string;
  count?: number;
  rounded?: boolean;
}

export function Skeleton({ width, height = 16, className = '', count = 1, rounded = true }: Props) {
  const style: CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };
  const item = (key: number) => (
    <div
      key={key}
      style={style}
      className={`bg-surface-2 animate-pulse ${rounded ? 'rounded' : ''} ${className}`}
      aria-hidden="true"
    />
  );
  if (count === 1) return item(0);
  return <div className="flex flex-col gap-2">{Array.from({ length: count }, (_, i) => item(i))}</div>;
}
