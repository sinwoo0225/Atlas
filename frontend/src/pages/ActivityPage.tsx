import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { activityApi } from '../api/activity';
import { ActivityRow } from '../components/ActivityRow';
import { Card, Button, Skeleton } from '../components/ui';
import type { ActivityLog } from '../types';

// 전역 활동 피드 — 모든 프로젝트 across 시간순. Dashboard 위젯과 동일 ActivityRow 재사용.
// 첫 로드 100건, "더 불러오기" 클릭 시 offset += PAGE_SIZE. 무한스크롤·필터는 후속.
const PAGE_SIZE = 100;

export function ActivityPage() {
  const [items, setItems] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    activityApi.getAll(PAGE_SIZE, 0)
      .then((rows) => {
        setItems(rows);
        setHasMore(rows.length === PAGE_SIZE);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const more = await activityApi.getAll(PAGE_SIZE, items.length);
      setItems((prev) => [...prev, ...more]);
      if (more.length < PAGE_SIZE) setHasMore(false);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Activity size={20} className="text-accent" />
        <h1 className="h-page">전체 활동</h1>
      </div>

      <Card padding="spacious">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={28} />)}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">활동 기록 없음</p>
        ) : (
          <>
            <div>
              {items.map((a) => <ActivityRow key={a.id} activity={a} />)}
            </div>
            {hasMore && (
              <div className="mt-4 flex justify-center">
                <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? '불러오는 중…' : '더 불러오기'}
                </Button>
              </div>
            )}
            {!hasMore && items.length > 0 && (
              <p className="mt-4 text-center text-xs text-muted">— 끝 —</p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
