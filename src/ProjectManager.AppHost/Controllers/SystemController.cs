using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using ProjectManager.Infrastructure.Config;

namespace ProjectManager.AppHost.Controllers;

[ApiController]
[Route("api/system")]
public class SystemController : ControllerBase
{
    public record SetDataFolderRequest(string Path);

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
