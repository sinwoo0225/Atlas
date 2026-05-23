using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using ProjectManager.Infrastructure.Config;

namespace ProjectManager.AppHost.Services;

// 자동 업데이트 — GitHub Releases 조회 + Setup.exe 다운로드 + 실행.
// 싱글톤: 인메모리 진행 상태(UpdateState)를 컨트롤러·UpdateCheckService 가 공유한다(폴링).
// 설치 적용은 사용자가 직접 트리거(다운로드까지만 자동) — 요청 범위.
public sealed class UpdateService
{
    // 릴리즈 피드 레포. 자산 이름이 "Atlas-Setup*.exe" 인 것을 인스톨러로 간주.
    private const string RepoOwner = "sinwoo0225";
    private const string RepoName = "Atlas";
    private const string AssetPrefix = "Atlas-Setup";

    private static readonly HttpClient Http = CreateHttpClient();

    // 어셈블리 informational version (Directory.Build.props 의 1.4.0). SystemController.Ping 과 동일 소스.
    private static readonly string CurrentVersion =
        Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? Assembly.GetExecutingAssembly().GetName().Version?.ToString()
        ?? "0.0.0";

    private readonly ILogger<UpdateService> _logger;
    private readonly object _gate = new();
    private readonly UpdateState _state = new();

    public UpdateService(ILogger<UpdateService> logger) => _logger = logger;

    private static HttpClient CreateHttpClient()
    {
        var http = new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
        // GitHub API 는 User-Agent 가 없으면 403. 명시 필수.
        http.DefaultRequestHeaders.UserAgent.ParseAdd("Atlas-Updater");
        http.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        return http;
    }

    // 현재 상태 스냅샷 (컨트롤러 status 응답용). 실행 중 동반 프로세스 개수도 함께.
    public UpdateStatusDto GetStatus()
    {
        lock (_gate)
        {
            return new UpdateStatusDto(
                _state.Phase,
                _state.Percent,
                _state.DownloadedPath,
                _state.Error,
                _state.LastResult,
                CountProcess("Atlas-Mcp"),
                CountProcess("Atlas-Cli"));
        }
    }

    public UpdateConfigDto GetConfig()
    {
        var c = BootstrapConfig.Load();
        return new UpdateConfigDto(
            c.UpdateCheckEnabled, c.UpdateCheckIntervalHours, c.UpdateLastCheckedAt, c.UpdateLatestKnownVersion);
    }

    public void SaveConfig(bool enabled, int intervalHours)
    {
        var c = BootstrapConfig.Load();
        c.UpdateCheckEnabled = enabled;
        c.UpdateCheckIntervalHours = intervalHours < 1 ? 1 : intervalHours;
        BootstrapConfig.Save(c);
    }

    // GitHub 의 최신(non-prerelease) 릴리즈를 조회해 현재 버전과 비교. 결과를 상태/설정에 기록.
    // 네트워크/파싱 실패는 모두 잡아 error 상태로 — 앱은 영향 없음.
    public async Task<UpdateCheckResult> CheckAsync(CancellationToken ct = default)
    {
        lock (_gate) { _state.Phase = "checking"; _state.Error = null; }
        try
        {
            var url = $"https://api.github.com/repos/{RepoOwner}/{RepoName}/releases/latest";
            using var resp = await Http.GetAsync(url, ct);
            if (!resp.IsSuccessStatusCode)
            {
                var hint = (int)resp.StatusCode switch
                {
                    401 or 404 => "릴리즈를 찾을 수 없습니다(비공개 저장소이거나 릴리즈 없음).",
                    403 => "GitHub 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.",
                    _ => $"GitHub 응답 오류({(int)resp.StatusCode}).",
                };
                throw new InvalidOperationException(hint);
            }

            await using var stream = await resp.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            var root = doc.RootElement;

            var tag = root.TryGetProperty("tag_name", out var t) ? t.GetString() : null;
            var latest = NormalizeVersion(tag);
            var notes = root.TryGetProperty("body", out var b) ? b.GetString() : null;
            var publishedAt = root.TryGetProperty("published_at", out var p) && p.ValueKind == JsonValueKind.String
                ? p.GetDateTime() : (DateTime?)null;

            string? downloadUrl = null, assetName = null;
            long sizeBytes = 0;
            if (root.TryGetProperty("assets", out var assets) && assets.ValueKind == JsonValueKind.Array)
            {
                foreach (var a in assets.EnumerateArray())
                {
                    var name = a.TryGetProperty("name", out var n) ? n.GetString() : null;
                    if (name is null) continue;
                    if (name.StartsWith(AssetPrefix, StringComparison.OrdinalIgnoreCase)
                        && name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                    {
                        assetName = name;
                        downloadUrl = a.TryGetProperty("browser_download_url", out var u) ? u.GetString() : null;
                        sizeBytes = a.TryGetProperty("size", out var s) ? s.GetInt64() : 0;
                        break;
                    }
                }
            }

            var hasUpdate = IsNewer(latest, CurrentVersion) && downloadUrl is not null;
            var result = new UpdateCheckResult(
                CurrentVersion, latest ?? "?", hasUpdate, notes, downloadUrl, assetName, sizeBytes, publishedAt);

            lock (_gate)
            {
                _state.LastResult = result;
                // 이미 받아둔 파일이 최신과 다르면 ready 상태 해제.
                _state.Phase = _state.Phase == "downloading" ? _state.Phase : "idle";
            }

            // 조회 시각·최신 버전을 config 에 기록 (재시작에도 주기 판정·시작 토스트 유지).
            var c = BootstrapConfig.Load();
            c.UpdateLastCheckedAt = DateTime.UtcNow;
            c.UpdateLatestKnownVersion = latest;
            BootstrapConfig.Save(c);

            return result;
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[update] check failed");
            lock (_gate) { _state.Phase = "error"; _state.Error = ex.Message; }
            return new UpdateCheckResult(CurrentVersion, "?", false, null, null, null, 0, null);
        }
    }

    // 마지막 체크 결과의 Setup.exe 를 %LOCALAPPDATA%\Atlas\updates\ 로 스트리밍 다운로드.
    // 백그라운드 Task 로 실행 — 진행률은 GetStatus() 로 폴링.
    public void StartDownload()
    {
        UpdateCheckResult? r;
        lock (_gate)
        {
            r = _state.LastResult;
            if (r is null || !r.HasUpdate || r.DownloadUrl is null)
            {
                _state.Phase = "error";
                _state.Error = "다운로드할 업데이트가 없습니다. 먼저 업데이트를 확인하세요.";
                return;
            }
            if (_state.Phase == "downloading") return; // 이미 진행 중
            _state.Phase = "downloading";
            _state.Percent = 0;
            _state.Error = null;
            _state.DownloadedPath = null;
        }
        _ = Task.Run(() => DownloadAsync(r!));
    }

    private async Task DownloadAsync(UpdateCheckResult r)
    {
        var dir = GetUpdatesFolder();
        Directory.CreateDirectory(dir);
        var fileName = r.AssetName ?? $"Atlas-Setup-{r.LatestVersion}.exe";
        var finalPath = Path.Combine(dir, fileName);
        var partPath = finalPath + ".part";

        // 같은 버전 파일이 이미 온전히 받아져 있으면 재다운로드 생략.
        if (File.Exists(finalPath) && r.SizeBytes > 0 && new FileInfo(finalPath).Length == r.SizeBytes)
        {
            lock (_gate) { _state.Phase = "ready"; _state.Percent = 100; _state.DownloadedPath = finalPath; }
            return;
        }

        try
        {
            using var resp = await Http.GetAsync(r.DownloadUrl!, HttpCompletionOption.ResponseHeadersRead);
            resp.EnsureSuccessStatusCode();
            var total = resp.Content.Headers.ContentLength ?? r.SizeBytes;

            if (File.Exists(partPath)) File.Delete(partPath);
            await using (var src = await resp.Content.ReadAsStreamAsync())
            await using (var dst = new FileStream(partPath, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                var buffer = new byte[81920];
                long read = 0;
                int n;
                while ((n = await src.ReadAsync(buffer)) > 0)
                {
                    await dst.WriteAsync(buffer.AsMemory(0, n));
                    read += n;
                    if (total > 0)
                    {
                        var pct = (int)(read * 100 / total);
                        lock (_gate) { _state.Percent = pct < 0 ? 0 : pct > 100 ? 100 : pct; }
                    }
                }
            }

            if (File.Exists(finalPath)) File.Delete(finalPath);
            File.Move(partPath, finalPath);
            lock (_gate) { _state.Phase = "ready"; _state.Percent = 100; _state.DownloadedPath = finalPath; }
            _logger.LogInformation("[update] downloaded {File}", fileName);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[update] download failed");
            try { if (File.Exists(partPath)) File.Delete(partPath); } catch { /* best effort */ }
            lock (_gate) { _state.Phase = "error"; _state.Error = $"다운로드 실패: {ex.Message}"; }
        }
    }

    // 다운로드된 Setup.exe 실행. Inno 가 UAC·실행 중 앱 종료(Restart Manager)·교체를 처리.
    // 호출 전 컨트롤러가 Local 모드인지 검증.
    public bool LaunchDownloaded(out string? error)
    {
        string? path;
        lock (_gate) { path = _state.DownloadedPath; }
        if (string.IsNullOrEmpty(path) || !File.Exists(path))
        {
            error = "설치 파일을 찾을 수 없습니다. 먼저 다운로드하세요.";
            return false;
        }
        try
        {
            Process.Start(new ProcessStartInfo { FileName = path, UseShellExecute = true });
            error = null;
            return true;
        }
        catch (Exception ex)
        {
            error = $"설치 파일 실행 실패: {ex.Message}";
            return false;
        }
    }

    public bool RevealDownloaded()
    {
        string? path;
        lock (_gate) { path = _state.DownloadedPath; }
        if (string.IsNullOrEmpty(path) || !File.Exists(path)) return false;
        try
        {
            Process.Start(new ProcessStartInfo { FileName = "explorer.exe", Arguments = $"/select,\"{path}\"", UseShellExecute = true });
            return true;
        }
        catch { return false; }
    }

    public static string GetUpdatesFolder()
    {
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(local, "Atlas", "updates");
    }

    private static int CountProcess(string name)
    {
        try { return Process.GetProcessesByName(name).Length; }
        catch { return 0; }
    }

    // "v1.5.0" / "1.5.0+abc" → "1.5.0"
    private static string? NormalizeVersion(string? tag)
    {
        if (string.IsNullOrWhiteSpace(tag)) return null;
        var v = tag.Trim();
        if (v.StartsWith('v') || v.StartsWith('V')) v = v[1..];
        var plus = v.IndexOf('+');
        if (plus >= 0) v = v[..plus];
        return v;
    }

    private static bool IsNewer(string? latest, string current)
    {
        var l = NormalizeVersion(latest);
        var c = NormalizeVersion(current);
        if (Version.TryParse(l, out var lv) && Version.TryParse(c, out var cv))
            return lv > cv;
        // 파싱 실패 시 보수적으로 false (오탐 방지).
        return false;
    }
}

public sealed class UpdateState
{
    public string Phase { get; set; } = "idle"; // idle | checking | downloading | ready | error
    public int Percent { get; set; }
    public string? DownloadedPath { get; set; }
    public string? Error { get; set; }
    public UpdateCheckResult? LastResult { get; set; }
}

public sealed record UpdateCheckResult(
    string CurrentVersion,
    string LatestVersion,
    bool HasUpdate,
    string? ReleaseNotes,
    string? DownloadUrl,
    string? AssetName,
    long SizeBytes,
    DateTime? PublishedAt);

public sealed record UpdateStatusDto(
    string Phase,
    int Percent,
    string? DownloadedPath,
    string? Error,
    UpdateCheckResult? LastResult,
    int RunningMcp,
    int RunningCli);

public sealed record UpdateConfigDto(
    bool Enabled,
    int IntervalHours,
    DateTime? LastCheckedAt,
    string? LatestKnownVersion);
