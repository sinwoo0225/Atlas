using System.Reflection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using ProjectManager.AppHost.Services;
using ProjectManager.Infrastructure.Config;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
[Route("api/system")]
public class SystemController : ControllerBase
{
    public record SetDataFolderRequest(string Path);

    // 어셈블리 informational version (Directory.Build.props 의 1.4.0 같은 semver).
    // 한 번 캡처해서 ping 응답에 포함 — 프론트가 mismatch 안내 시 사용자에게 보여줌.
    private static readonly string AssemblyVersion =
        Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? Assembly.GetExecutingAssembly().GetName().Version?.ToString()
        ?? "?";

    // 클라이언트 연결 테스트용 — Phase B 의 API 키 미들웨어가 가로채면 401 로 변환되어
    // 클라가 "키 불일치" 를 구분할 수 있다. Local InProcessHost 에서는 미들웨어 없으므로 그냥 200.
    // apiVersion: breaking change 시 수동 +1. version: 정보 표시용 어셈블리 semver.
    [HttpGet("ping")]
    public IActionResult Ping() => Ok(new { ok = true, server = "atlas", apiVersion = 1, version = AssemblyVersion });

    [HttpGet("data-folder")]
    public IActionResult GetDataFolder()
    {
        var saved = BootstrapConfig.Load();
        return Ok(new
        {
            current = saved.ResolveDataFolder(),
            defaultPath = BootstrapConfig.GetDefaultDataFolder(),
            configFilePath = BootstrapConfig.GetConfigFilePath(),
        });
    }

    [HttpPost("data-folder/preview")]
    public IActionResult Preview([FromBody] SetDataFolderRequest req)
    {
        var path = (req.Path ?? string.Empty).Trim();
        var warnings = new List<string>();

        if (string.IsNullOrEmpty(path))
        {
            return Ok(new
            {
                exists = false,
                isWritable = false,
                hasExistingDb = false,
                projectCount = (int?)null,
                warnings = new[] { "경로가 비어 있습니다." },
            });
        }

        var exists = Directory.Exists(path);
        bool isWritable;
        var hasExistingDb = false;
        int? projectCount = null;

        if (exists)
        {
            isWritable = CheckWritable(path);
            if (!isWritable) warnings.Add("이 폴더에 쓰기 권한이 없습니다.");

            var dbPath = Path.Combine(path, "projectmanager.db");
            hasExistingDb = System.IO.File.Exists(dbPath);
            if (hasExistingDb)
            {
                projectCount = TryCountProjects(dbPath, out var dbWarning);
                if (dbWarning is not null) warnings.Add(dbWarning);
            }
        }
        else
        {
            // 폴더가 없으면 부모 폴더의 쓰기 권한으로 추정 (저장 단계에서 CreateDirectory 시도).
            var parent = Path.GetDirectoryName(path);
            isWritable = !string.IsNullOrEmpty(parent) && Directory.Exists(parent) && CheckWritable(parent!);
            if (!isWritable) warnings.Add("이 폴더(또는 상위 폴더)에 쓰기 권한이 없습니다.");
        }

        if (LooksLikeCloudSync(path))
            warnings.Add("이 경로는 OneDrive/Dropbox 같은 자동 동기화 폴더로 보입니다. SQLite 데이터베이스 손상 위험이 있어 권장하지 않습니다.");

        return Ok(new { exists, isWritable, hasExistingDb, projectCount, warnings });
    }

    [HttpPut("data-folder")]
    public IActionResult SetDataFolder([FromBody] SetDataFolderRequest req)
    {
        var path = (req.Path ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(path)) return BadRequest(new { error = "경로가 비어 있습니다." });

        try { Directory.CreateDirectory(path); }
        catch (Exception ex) { return BadRequest(new { error = $"폴더를 만들 수 없습니다: {ex.Message}" }); }

        if (!CheckWritable(path))
            return BadRequest(new { error = "이 폴더에 쓰기 권한이 없습니다." });

        var cfg = BootstrapConfig.Load();
        cfg.DataFolder = path;
        BootstrapConfig.Save(cfg);

        return Ok(new { saved = path, requiresRestart = true });
    }

    // ===== 자동 백업 =====
    public record BackupConfigDto(bool Enabled, string? Folder, int IntervalHours, int Retention, bool IncludeFiles);

    [HttpGet("backup/config")]
    public IActionResult GetBackupConfig()
    {
        var c = BootstrapConfig.Load();
        return Ok(new BackupConfigDto(
            c.AutoBackupEnabled, c.BackupFolder, c.BackupIntervalHours, c.BackupRetention, c.BackupIncludeFiles));
    }

    [HttpPut("backup/config")]
    public IActionResult SetBackupConfig([FromBody] BackupConfigDto req, [FromServices] BackupService backup)
    {
        var folder = req.Folder?.Trim();
        if (req.Enabled && string.IsNullOrEmpty(folder))
            return BadRequest(new { error = "자동 백업을 켜려면 백업 폴더를 지정하세요." });
        if (!string.IsNullOrEmpty(folder) && backup.IsDestInsideDataFolder(folder))
            return BadRequest(new { error = "백업 폴더는 데이터 폴더 안에 둘 수 없습니다." });

        var c = BootstrapConfig.Load();
        c.AutoBackupEnabled = req.Enabled;
        c.BackupFolder = string.IsNullOrEmpty(folder) ? null : folder;
        c.BackupIntervalHours = req.IntervalHours < 0 ? 0 : req.IntervalHours; // 0 = 매 실행
        c.BackupRetention = req.Retention;
        c.BackupIncludeFiles = req.IncludeFiles;
        BootstrapConfig.Save(c);
        return Ok(new { saved = true });
    }

    [HttpPost("backup/run")]
    public async Task<IActionResult> RunBackup([FromServices] BackupService backup)
    {
        var c = BootstrapConfig.Load();
        if (string.IsNullOrWhiteSpace(c.BackupFolder))
            return BadRequest(new { error = "백업 폴더가 설정되지 않았습니다." });
        try
        {
            var r = await backup.CreateFullBackupAsync(
                c.BackupFolder!, c.BackupIncludeFiles, c.BackupRetention, HttpContext.RequestAborted);
            return Ok(new { fileName = r.FileName, sizeBytes = r.SizeBytes, createdAt = r.CreatedAtUtc });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("backup/status")]
    public IActionResult BackupStatus([FromServices] BackupService backup)
    {
        var c = BootstrapConfig.Load();
        var (last, count) = backup.GetStatus(c.BackupFolder);
        return Ok(new { folder = c.BackupFolder, lastBackupAt = last, count });
    }

    private static bool CheckWritable(string path)
    {
        try
        {
            var probe = Path.Combine(path, $".atlas-write-test-{Guid.NewGuid():N}.tmp");
            using (System.IO.File.Create(probe)) { }
            System.IO.File.Delete(probe);
            return true;
        }
        catch { return false; }
    }

    private static int? TryCountProjects(string dbPath, out string? warning)
    {
        warning = null;
        try
        {
            using var conn = new SqliteConnection($"Data Source={dbPath};Mode=ReadOnly");
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT COUNT(*) FROM Projects";
            var result = cmd.ExecuteScalar();
            return result is null ? 0 : Convert.ToInt32(result);
        }
        catch
        {
            warning = "이 폴더의 projectmanager.db 가 Atlas 데이터베이스가 아닌 것 같습니다.";
            return null;
        }
    }

    private static bool LooksLikeCloudSync(string path)
    {
        var n = path.ToLowerInvariant();
        return n.Contains("onedrive")
            || n.Contains("dropbox")
            || n.Contains(Path.DirectorySeparatorChar + "google drive" + Path.DirectorySeparatorChar)
            || n.Contains(Path.DirectorySeparatorChar + "box" + Path.DirectorySeparatorChar);
    }
}
