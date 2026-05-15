using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.DTOs;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.Application.Search;

// FTS5 search_index 의 단일 진입점. stateless — AppDbContext 는 메서드 인자로 받는다.
// (생성자 의존으로 받으면 인터셉터 ↔ DbContext ↔ SearchService 순환 의존이 생긴다.)
public class SearchService
{
    private const int MaxLimit = 200;
    private const int DefaultLimit = 50;
    private const int SnippetTokens = 32;

    public async Task<List<SearchHit>> SearchAsync(
        AppDbContext db, string query, string[]? types, int? projectId, int limit, CancellationToken ct = default)
    {
        var sanitized = SanitizeQuery(query);
        if (string.IsNullOrEmpty(sanitized)) return new List<SearchHit>();

        var capped = Math.Clamp(limit <= 0 ? DefaultLimit : limit, 1, MaxLimit);

        // Type 필터는 정해진 화이트리스트(SearchIndexer.AllTypes) 와 교집합만 허용 — SQL 주입 차단.
        var typeFilter = types?
            .Where(t => SearchIndexer.AllTypes.Contains(t))
            .Distinct()
            .ToArray();

        var sql =
            "SELECT entity_type, entity_id, project_id, " +
            "       highlight(search_index, 3, '<mark>', '</mark>') AS htitle, " +
            "       snippet(search_index, 4, '<mark>', '</mark>', '...', " + SnippetTokens + ") AS snip, " +
            "       updated_at " +
            "FROM search_index " +
            "WHERE search_index MATCH $q ";

        var conn = db.Database.GetDbConnection();
        await EnsureOpenAsync(conn, ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        cmd.Parameters.Add(new SqliteParameter("$q", sanitized));

        if (projectId.HasValue)
        {
            cmd.CommandText += "AND project_id = $pid ";
            cmd.Parameters.Add(new SqliteParameter("$pid", projectId.Value.ToString()));
        }

        if (typeFilter is { Length: > 0 })
        {
            var ph = string.Join(",", typeFilter.Select((_, i) => "$t" + i));
            cmd.CommandText += "AND entity_type IN (" + ph + ") ";
            for (var i = 0; i < typeFilter.Length; i++)
                cmd.Parameters.Add(new SqliteParameter("$t" + i, typeFilter[i]));
        }

        cmd.CommandText += "ORDER BY bm25(search_index) LIMIT $lim;";
        cmd.Parameters.Add(new SqliteParameter("$lim", capped));

        var raw = new List<(string Type, int Id, int? ProjectId, string Title, string Snippet, DateTime UpdatedAt)>();
        await using (var reader = await cmd.ExecuteReaderAsync(ct))
        {
            while (await reader.ReadAsync(ct))
            {
                var type = reader.GetString(0);
                var id = int.Parse(reader.GetString(1));
                var pidRaw = reader.IsDBNull(2) ? null : reader.GetString(2);
                int? pid = string.IsNullOrEmpty(pidRaw) ? null : int.Parse(pidRaw);
                var title = reader.IsDBNull(3) ? string.Empty : reader.GetString(3);
                var snip = reader.IsDBNull(4) ? string.Empty : reader.GetString(4);
                var updated = DateTime.Parse(reader.GetString(5));
                raw.Add((type, id, pid, title, snip, updated));
            }
        }

        var projectIds = raw.Where(r => r.ProjectId.HasValue).Select(r => r.ProjectId!.Value).Distinct().ToArray();
        Dictionary<int, string> projectNames;
        if (projectIds.Length > 0)
        {
            projectNames = await db.Projects.AsNoTracking()
                .Where(p => projectIds.Contains(p.Id))
                .Select(p => new { p.Id, p.Name })
                .ToDictionaryAsync(p => p.Id, p => p.Name, ct);
        }
        else
        {
            projectNames = new Dictionary<int, string>();
        }

        return raw.Select(r => new SearchHit(
            Type: r.Type,
            Id: r.Id,
            ProjectId: r.ProjectId,
            ProjectName: r.ProjectId.HasValue && projectNames.TryGetValue(r.ProjectId.Value, out var n) ? n : null,
            Title: r.Title,
            Snippet: r.Snippet,
            UpdatedAt: r.UpdatedAt
        )).ToList();
    }

    public Task IndexEntityAsync(AppDbContext db, object entity, CancellationToken ct = default)
    {
        var row = SearchIndexer.ToRow(entity, db);
        return row == null ? Task.CompletedTask : UpsertAsync(db, row, ct);
    }

    public Task DeleteEntityAsync(AppDbContext db, object entity, CancellationToken ct = default)
    {
        var id = SearchIndexer.Identify(entity);
        return id is null ? Task.CompletedTask : DeleteAsync(db, id.Value.Type, id.Value.Id, ct);
    }

    public Task DeleteAsync(AppDbContext db, string type, int id, CancellationToken ct = default) =>
        db.Database.ExecuteSqlRawAsync(
            "DELETE FROM search_index WHERE entity_type = {0} AND entity_id = {1};",
            new object[] { type, id.ToString() }, ct);

    public async Task<int> CountAsync(AppDbContext db, CancellationToken ct = default)
    {
        var conn = db.Database.GetDbConnection();
        await EnsureOpenAsync(conn, ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT count(*) FROM search_index;";
        var result = await cmd.ExecuteScalarAsync(ct);
        return Convert.ToInt32(result);
    }

    // 모든 색인 행을 비우고 9개 엔티티 테이블을 풀스캔해 다시 채운다.
    // 데이터 폴더 이전·복원 직후 한 번이면 된다.
    public async Task<int> RebuildAllAsync(AppDbContext db, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync("DELETE FROM search_index;", ct);

        var total = 0;
        foreach (var p in await db.Projects.AsNoTracking().ToListAsync(ct))
        {
            await IndexEntityAsync(db, p, ct); total++;
        }
        foreach (var w in await db.WbsItems.AsNoTracking().ToListAsync(ct))
        {
            await IndexEntityAsync(db, w, ct); total++;
        }
        foreach (var i in await db.Issues.AsNoTracking().Include(x => x.AssigneeResource).ToListAsync(ct))
        {
            await IndexEntityAsync(db, i, ct); total++;
        }
        foreach (var m in await db.Meetings.AsNoTracking().ToListAsync(ct))
        {
            await IndexEntityAsync(db, m, ct); total++;
        }
        foreach (var c in await db.ChangeLogs.AsNoTracking().ToListAsync(ct))
        {
            await IndexEntityAsync(db, c, ct); total++;
        }
        foreach (var d in await db.DevInfoItems.AsNoTracking().ToListAsync(ct))
        {
            await IndexEntityAsync(db, d, ct); total++;
        }
        foreach (var wl in await db.WorkLogs.AsNoTracking().ToListAsync(ct))
        {
            await IndexEntityAsync(db, wl, ct); total++;
        }
        return total;
    }

    private async Task UpsertAsync(AppDbContext db, IndexRow row, CancellationToken ct)
    {
        // FTS5 는 ON CONFLICT 가 없어 DELETE 후 INSERT 로 upsert.
        await db.Database.ExecuteSqlRawAsync(
            "DELETE FROM search_index WHERE entity_type = {0} AND entity_id = {1};",
            new object[] { row.Type, row.Id.ToString() }, ct);

        await db.Database.ExecuteSqlRawAsync(
            "INSERT INTO search_index(entity_type, entity_id, project_id, title, body, updated_at) " +
            "VALUES ({0}, {1}, {2}, {3}, {4}, {5});",
            new object[]
            {
                row.Type,
                row.Id.ToString(),
                row.ProjectId?.ToString() ?? string.Empty,
                row.Title ?? string.Empty,
                row.Body ?? string.Empty,
                row.UpdatedAt.ToString("o")
            }, ct);
    }

    // 사용자 입력을 FTS5 MATCH 표현식으로 변환. 토큰별 phrase 매칭 + AND.
    // 특수문자(", *, :, NEAR 등) 는 모두 phrase 안에 갇혀 안전.
    private static string SanitizeQuery(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
        var cleaned = new string(raw.Where(c => !char.IsControl(c)).ToArray()).Trim();
        if (string.IsNullOrEmpty(cleaned)) return string.Empty;
        var tokens = cleaned.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length == 0) return string.Empty;
        return string.Join(" ", tokens.Select(t => "\"" + t.Replace("\"", "\"\"") + "\""));
    }

    private static async Task EnsureOpenAsync(System.Data.Common.DbConnection conn, CancellationToken ct)
    {
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync(ct);
    }
}
