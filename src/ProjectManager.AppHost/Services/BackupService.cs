using System.IO.Compression;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using ProjectManager.Infrastructure.Config;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.AppHost.Services;

public sealed record BackupResult(string FileName, long SizeBytes, DateTime CreatedAtUtc);

// 전체 데이터(DB + 모든 프로젝트 첨부) 를 지정 폴더로 zip 백업.
// - DB 는 VACUUM INTO 로 일관 스냅샷 (live 파일 복사의 손상 위험 회피).
// - zip 구조는 프로젝트 단위 백업(ProjectService.CreateBackupAsync) 과 동일:
//     db/projectmanager.db  +  projectFolder/<폴더명>/**  +  backup-info.txt
//   → 기존 프로젝트 가져오기(import) 와 호환.
// - .part 로 쓴 뒤 rename → 클라우드 동기화가 반쓰기 파일을 잡지 않게.
public class BackupService
{
    public const string Prefix = "Atlas-backup-";

    private readonly AppDbContext _db;
    private readonly PathResolver _paths;

    public BackupService(AppDbContext db, PathResolver paths)
    {
        _db = db;
        _paths = paths;
    }

    public static bool IsBackupZip(string fileName) =>
        fileName.StartsWith(Prefix, StringComparison.OrdinalIgnoreCase)
        && fileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase);

    private static string Norm(string p) => Path.TrimEndingDirectorySeparator(Path.GetFullPath(p));

    // dest 가 데이터 폴더(또는 그 하위)면 재귀 백업 → 거부.
    public bool IsDestInsideDataFolder(string destFolder)
    {
        var dataDir = Norm(Path.GetDirectoryName(_paths.GetDatabasePath())!);
        var dest = Norm(destFolder);
        return string.Equals(dest, dataDir, StringComparison.OrdinalIgnoreCase)
            || dest.StartsWith(dataDir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    }

    public async Task<BackupResult> CreateFullBackupAsync(
        string destFolder, bool includeFiles, int retention, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(destFolder))
            throw new InvalidOperationException("백업 폴더가 지정되지 않았습니다.");
        if (IsDestInsideDataFolder(destFolder))
            throw new InvalidOperationException("백업 폴더는 데이터 폴더 안에 둘 수 없습니다.");

        Directory.CreateDirectory(destFolder);

        var dbPath = _paths.GetDatabasePath();
        var dataDir = Norm(Path.GetDirectoryName(dbPath)!);

        var stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
        var fileName = $"{Prefix}{stamp}.zip";
        var finalPath = Path.Combine(destFolder, fileName);
        var partPath = finalPath + ".part";
        var snapshot = Path.Combine(Path.GetTempPath(), $"atlas-snap-{Guid.NewGuid():N}.db");

        try
        {
            // 1) 일관 스냅샷 — VACUUM INTO (원본 미변경, WAL 포함 일관 사본)
            await using (var conn = new SqliteConnection($"Data Source={dbPath};Default Timeout=30"))
            {
                await conn.OpenAsync(ct);
                await using var cmd = conn.CreateCommand();
                // VACUUM INTO 는 파일명 파라미터 바인딩 미지원 → 리터럴(작은따옴표 이스케이프).
                cmd.CommandText = $"VACUUM INTO '{snapshot.Replace("'", "''")}'";
                await cmd.ExecuteNonQueryAsync(ct);
            }

            // 2) zip (.part → rename)
            if (File.Exists(partPath)) File.Delete(partPath);
            await using (var zipFs = new FileStream(partPath, FileMode.Create, FileAccess.Write, FileShare.None))
            using (var archive = new ZipArchive(zipFs, ZipArchiveMode.Create))
            {
                archive.CreateEntryFromFile(snapshot, "db/projectmanager.db", CompressionLevel.Optimal);

                var projectCount = 0;
                if (includeFiles)
                {
                    var projects = await _db.Projects
                        .AsNoTracking()
                        .Select(p => new { p.Id, p.FolderPath })
                        .ToListAsync(ct);
                    projectCount = projects.Count;

                    foreach (var p in projects)
                    {
                        ct.ThrowIfCancellationRequested();
                        if (string.IsNullOrWhiteSpace(p.FolderPath)) continue;
                        var folderFull = Norm(p.FolderPath);
                        if (!Directory.Exists(folderFull)) continue;
                        // 데이터 폴더 루트 자체면 (DB·타 프로젝트 혼입) 건너뜀.
                        if (string.Equals(folderFull, dataDir, StringComparison.OrdinalIgnoreCase)) continue;

                        var folderName = Path.GetFileName(folderFull);
                        if (string.IsNullOrEmpty(folderName)) folderName = $"project_{p.Id}";

                        foreach (var filePath in Directory.EnumerateFiles(folderFull, "*", SearchOption.AllDirectories))
                        {
                            var rel = Path.GetRelativePath(folderFull, filePath).Replace('\\', '/');
                            var entryName = $"projectFolder/{folderName}/{rel}";
                            try
                            {
                                var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
                                await using var es = entry.Open();
                                await using var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                                await fs.CopyToAsync(es, ct);
                            }
                            catch (IOException) { /* 잠긴 파일 건너뜀 */ }
                        }
                    }
                }

                var meta = $"Atlas full backup\nCreated: {DateTime.Now:yyyy-MM-ddTHH:mm:ss}\nIncludeFiles: {includeFiles}\nProjects: {projectCount}\n";
                var metaEntry = archive.CreateEntry("backup-info.txt", CompressionLevel.Optimal);
                await using var metaStream = metaEntry.Open();
                await using var writer = new StreamWriter(metaStream);
                await writer.WriteAsync(meta);
            }

            if (File.Exists(finalPath)) File.Delete(finalPath);
            File.Move(partPath, finalPath);
        }
        finally
        {
            try { if (File.Exists(snapshot)) File.Delete(snapshot); } catch { /* best effort */ }
            try { if (File.Exists(partPath)) File.Delete(partPath); } catch { /* best effort */ }
        }

        Prune(destFolder, retention);

        var fi = new FileInfo(finalPath);
        return new BackupResult(fileName, fi.Length, fi.LastWriteTimeUtc);
    }

    // 최근 retention 개만 남기고 오래된 것 삭제. retention<=0 이면 무제한.
    public void Prune(string destFolder, int retention)
    {
        if (retention <= 0 || !Directory.Exists(destFolder)) return;
        var backups = Directory.EnumerateFiles(destFolder, $"{Prefix}*.zip")
            .Where(f => IsBackupZip(Path.GetFileName(f)))
            // 파일명에 yyyyMMdd_HHmmss 타임스탬프 → 사전식 정렬 = 시간순.
            .OrderByDescending(f => Path.GetFileName(f), StringComparer.OrdinalIgnoreCase)
            .ToList();
        foreach (var old in backups.Skip(retention))
        {
            try { File.Delete(old); } catch { /* best effort */ }
        }
    }

    public (DateTime? LastBackupUtc, int Count) GetStatus(string? destFolder)
    {
        if (string.IsNullOrWhiteSpace(destFolder) || !Directory.Exists(destFolder))
            return (null, 0);
        var backups = Directory.EnumerateFiles(destFolder, $"{Prefix}*.zip")
            .Where(f => IsBackupZip(Path.GetFileName(f)))
            .Select(f => new FileInfo(f))
            .ToList();
        return backups.Count == 0 ? (null, 0) : (backups.Max(f => f.LastWriteTimeUtc), backups.Count);
    }
}
