import { useEffect, useState } from 'react';

// value 가 delay(ms) 동안 안정되면 반환값을 갱신. 검색어 입력 중 매 키 필터링 비용 제거용.
export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
