using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.Application.Search;

// DbContext SaveChanges 후 search_index 를 동기화. 본 트랜잭션 커밋 이후에 실행되므로
// 인덱스 갱신이 실패해도 비즈니스 데이터는 안전. 실패 시 콘솔 로그만 남기고 swallow —
// 드리프트가 누적되면 사용자가 /api/search/rebuild 로 복구 가능.
//
// SearchService 는 stateless 이고 DbContext 는 eventData.Context 에서 꺼낸다.
// 인터셉터 자체에 DbContext 의존을 두지 않아 순환 의존을 피한다.
public class SearchSaveChangesInterceptor(SearchService search) : SaveChangesInterceptor
{
    private List<object>? _pendingUpserts;
    private List<(string Type, int Id)>? _pendingDeletes;

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        Capture(eventData.Context?.ChangeTracker);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData, InterceptionResult<int> result)
    {
        Capture(eventData.Context?.ChangeTracker);
        return base.SavingChanges(eventData, result);
    }

    public override async ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
    {
        if (eventData.Context is AppDbContext db)
            await ApplyAsync(db, cancellationToken);
        return await base.SavedChangesAsync(eventData, result, cancellationToken);
    }

    public override int SavedChanges(SaveChangesCompletedEventData eventData, int result)
    {
        if (eventData.Context is AppDbContext db)
        {
            try { ApplyAsync(db, CancellationToken.None).GetAwaiter().GetResult(); }
            catch { /* swallow — 본 commit 은 이미 성공 */ }
        }
        return base.SavedChanges(eventData, result);
    }

    public override Task SaveChangesFailedAsync(
        DbContextErrorEventData eventData, CancellationToken cancellationToken = default)
    {
        _pendingUpserts = null;
        _pendingDeletes = null;
        return base.SaveChangesFailedAsync(eventData, cancellationToken);
    }

    public override void SaveChangesFailed(DbContextErrorEventData eventData)
    {
        _pendingUpserts = null;
        _pendingDeletes = null;
        base.SaveChangesFailed(eventData);
    }

    private void Capture(ChangeTracker? tracker)
    {
        if (tracker == null) return;
        var upserts = new List<object>();
        var deletes = new List<(string, int)>();
        foreach (var entry in tracker.Entries())
        {
            // Added 의 경우 Id 가 아직 0 일 수 있으므로 엔티티 ref 만 보관, SavedChanges 시점에 다시 Identify.
            if (entry.State is EntityState.Added or EntityState.Modified)
            {
                if (SearchIndexer.Identify(entry.Entity) is not null)
                    upserts.Add(entry.Entity);
            }
            else if (entry.State == EntityState.Deleted)
            {
                // Deleted 의 Id 는 이 시점에 유효 (load 된 값). SavedChanges 후엔 detach 되므로 지금 꺼낸다.
                var id = SearchIndexer.Identify(entry.Entity);
                if (id is not null) deletes.Add(id.Value);
            }
        }
        _pendingUpserts = upserts.Count > 0 ? upserts : null;
        _pendingDeletes = deletes.Count > 0 ? deletes : null;
    }

    private async Task ApplyAsync(AppDbContext db, CancellationToken ct)
    {
        var upserts = _pendingUpserts;
        var deletes = _pendingDeletes;
        _pendingUpserts = null;
        _pendingDeletes = null;
        if (upserts == null && deletes == null) return;
        try
        {
            if (deletes != null)
                foreach (var (type, id) in deletes)
                    await search.DeleteAsync(db, type, id, ct);
            if (upserts != null)
                foreach (var e in upserts)
                    await search.IndexEntityAsync(db, e, ct);
        }
        catch (Exception ex)
        {
            // 인덱스 동기화 실패는 본 작업을 막지 않는다. 누적 드리프트는 /api/search/rebuild 로 복구.
            Console.Error.WriteLine("[search-index] sync failed: " + ex.Message);
        }
    }
}
