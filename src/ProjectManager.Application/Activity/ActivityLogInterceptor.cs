using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;
using ProjectManager.Core.Domain;
using ProjectManager.Core.DTOs;
using ProjectManager.Core.Interfaces;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.Application.Activity;

// IAuditable 엔티티의 Create/Update/Delete 를 ActivityLog 로 자동 기록.
// SearchSaveChangesInterceptor 와 동일 패턴 — SavingChanges 에서 ChangeTracker 캡처, SavedChanges 에서 insert.
// Added 의 Id 는 SavingChanges 시점에 0 이므로 entity 참조만 들고 가서 SavedChanges 후 다시 Identify.
// Deleted 의 Id 는 그 시점에 유효하므로 미리 추출.
//
// ApplyAsync 내부의 SaveChangesAsync 가 본 인터셉터를 다시 트리거하지만 ActivityLog 자체는 IAuditable 이 아니므로
// 캡처에서 skip → 무한루프 없음. 활동 기록 실패는 본 commit 을 막지 않고 stderr 로그만 남긴다.
public class ActivityLogInterceptor(IActorAccessor actorAccessor) : SaveChangesInterceptor
{
    private List<PendingActivity>? _pending;

    private record PendingActivity(
        object? EntityRef,
        ActivityIdentifier.Identity? PreResolved,
        ActivityAction Action,
        string Actor,
        DateTime Timestamp,
        string? ChangesJson);

    // 필드 diff 에서 제외: 자동 audit 메타 + Project.FolderPath (생성 시 자동 세팅, 사용자 의도 변경 아님).
    private static bool IsExcludedProperty(string name) => name switch
    {
        "Id" or "CreatedAt" or "UpdatedAt" or "CreatedBy" or "UpdatedBy" or "FolderPath" => true,
        _ => false,
    };

    private static string FormatValue(object? v)
    {
        if (v is null) return string.Empty;
        if (v is DateTime dt) return dt.ToString("o");
        var s = v.ToString() ?? string.Empty;
        // 장문 텍스트 (Content/Notes/Description 등) 는 첫 줄 80자 + "…" 로 truncation.
        // ActivityIdentifier.EntityTitle 패턴 일관.
        if (s.Length > 200)
            s = ActivityIdentifier.TrimFirstLine(s, 80) + "…";
        return s;
    }

    private static readonly JsonSerializerOptions ChangesJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

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
        _pending = null;
        return base.SaveChangesFailedAsync(eventData, cancellationToken);
    }

    public override void SaveChangesFailed(DbContextErrorEventData eventData)
    {
        _pending = null;
        base.SaveChangesFailed(eventData);
    }

    private void Capture(ChangeTracker? tracker)
    {
        if (tracker == null) return;
        var actor = actorAccessor.GetActor();
        var ts = DateTime.UtcNow;
        var list = new List<PendingActivity>();
        foreach (var entry in tracker.Entries())
        {
            if (entry.Entity is not IAuditable) continue;
            // ActivityLog 자체는 IAuditable 이 아니므로 여기서 걸러질 일이 없지만 방어차원.
            if (entry.Entity is ActivityLog) continue;

            ActivityAction? action = entry.State switch
            {
                EntityState.Added => ActivityAction.Create,
                EntityState.Modified => ActivityAction.Update,
                EntityState.Deleted => ActivityAction.Delete,
                _ => null,
            };
            if (action == null) continue;

            if (entry.State == EntityState.Added)
            {
                // Id 가 SavedChanges 후 채워지므로 entity ref 만 보관. Create 는 필드 diff 없음.
                list.Add(new PendingActivity(entry.Entity, null, action.Value, actor, ts, null));
            }
            else if (entry.State == EntityState.Deleted)
            {
                // Deleted entity 는 SavedChanges 후 detach 되므로 지금 Identify. Delete 도 필드 diff 없음.
                var ident = ActivityIdentifier.Identify(entry.Entity);
                if (ident is not null)
                    list.Add(new PendingActivity(null, ident, action.Value, actor, ts, null));
            }
            else
            {
                // Modified — entity ref 도 살아있고 Id 도 유효. 필드 diff 도 여기서 캡처.
                var changes = new Dictionary<string, ActivityChangeValue>();
                foreach (var prop in entry.Properties.Where(p => p.IsModified))
                {
                    var name = prop.Metadata.Name;
                    if (IsExcludedProperty(name)) continue;
                    var oldStr = FormatValue(prop.OriginalValue);
                    var newStr = FormatValue(prop.CurrentValue);
                    if (oldStr == newStr) continue;
                    changes[name] = new ActivityChangeValue(oldStr, newStr);
                }
                var json = changes.Count > 0
                    ? JsonSerializer.Serialize(changes, ChangesJsonOptions)
                    : null;
                list.Add(new PendingActivity(entry.Entity, null, action.Value, actor, ts, json));
            }
        }
        _pending = list.Count > 0 ? list : null;
    }

    private async Task ApplyAsync(AppDbContext db, CancellationToken ct)
    {
        var pending = _pending;
        _pending = null;
        if (pending == null) return;

        try
        {
            var rows = new List<ActivityLog>(pending.Count);
            foreach (var p in pending)
            {
                var ident = p.PreResolved ?? (p.EntityRef is null ? null : ActivityIdentifier.Identify(p.EntityRef));
                if (ident is null) continue;
                rows.Add(new ActivityLog
                {
                    ProjectId = ident.Value.ProjectId,
                    EntityType = ident.Value.EntityType,
                    EntityId = ident.Value.EntityId,
                    EntityTitle = ident.Value.Title,
                    Action = p.Action,
                    Actor = p.Actor,
                    Timestamp = p.Timestamp,
                    ChangesJson = p.ChangesJson,
                });
            }
            if (rows.Count == 0) return;
            db.ActivityLogs.AddRange(rows);
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("[activity-log] sync failed: " + ex.Message);
        }
    }
}
