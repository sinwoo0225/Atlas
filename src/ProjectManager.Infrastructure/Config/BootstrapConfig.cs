using System.Text.Json;
using System.Text.Json.Serialization;

namespace ProjectManager.Infrastructure.Config;

// 머신·계정 별로 1개. 데이터 폴더 결정 *이전에* 읽혀야 하므로 반드시 로컬 경로
// (%LOCALAPPDATA%\Atlas\config.json). 절대 공유/네트워크 폴더에 두지 않는다.
public sealed class BootstrapConfig
{
    [JsonPropertyName("dataFolder")]
    public string? DataFolder { get; set; }

    // "Local" (기본, InProcessHost) | "Client" (원격 Atlas-Server 에 붙음)
    [JsonPropertyName("mode")]
    public string Mode { get; set; } = "Local";

    // Client 모드에서만 의미. 예: "http://atlas.intranet:5200"
    [JsonPropertyName("serverUrl")]
    public string? ServerUrl { get; set; }

    // Client 모드에서 X-Atlas-Key 헤더로 전송. 서버가 ATLAS_API_KEY 와 비교.
    [JsonPropertyName("apiKey")]
    public string? ApiKey { get; set; }

    // ===== 자동 백업 (Local 데스크톱 in-process · 서버에서 동작) =====
    // 백엔드 AutoBackupService 가 매 틱 재로드해 사용. config.json 에 두므로 재시작 불필요.
    [JsonPropertyName("autoBackupEnabled")]
    public bool AutoBackupEnabled { get; set; }

    // 백업 zip 을 떨굴 폴더. OneDrive/Dropbox 등 동기화 폴더 권장. 데이터 폴더 하위 금지(재귀).
    [JsonPropertyName("backupFolder")]
    public string? BackupFolder { get; set; }

    [JsonPropertyName("backupIntervalHours")]
    public int BackupIntervalHours { get; set; } = 24;

    // 보관할 최근 백업 개수. 0 이하면 무제한(자동 삭제 안 함).
    [JsonPropertyName("backupRetention")]
    public int BackupRetention { get; set; } = 10;

    [JsonPropertyName("backupIncludeFiles")]
    public bool BackupIncludeFiles { get; set; } = true;

    // ===== 자동 업데이트 체크 (Local 데스크톱 in-process · 서버에서 동작) =====
    // 백엔드 UpdateCheckService 가 매 틱 재로드해 GitHub 릴리즈를 조회. 다운로드는 사용자가 직접 트리거.
    [JsonPropertyName("updateCheckEnabled")]
    public bool UpdateCheckEnabled { get; set; } = true;

    [JsonPropertyName("updateCheckIntervalHours")]
    public int UpdateCheckIntervalHours { get; set; } = 24;

    // 마지막으로 GitHub 를 조회한 시각(UTC). 주기 도래 판정 + 재시작에도 중복 조회 방지.
    [JsonPropertyName("updateLastCheckedAt")]
    public DateTime? UpdateLastCheckedAt { get; set; }

    // 마지막 조회에서 발견한 최신 릴리즈 버전(semver). 시작 시 토스트 노출 판단용.
    [JsonPropertyName("updateLatestKnownVersion")]
    public string? UpdateLatestKnownVersion { get; set; }

    // ===== 브랜드(워드마크) — 프론트가 setBrand 로 보내면 호스트가 여기 저장.
    // 다음 실행 시 로딩 오버레이·제목 표시줄을 프론트 로드 전에 미리 칠하는 용도. =====
    [JsonPropertyName("brandPrimaryText")]
    public string? BrandPrimaryText { get; set; }

    [JsonPropertyName("brandAccentText")]
    public string? BrandAccentText { get; set; }

    [JsonPropertyName("brandPrimaryColor")]
    public string? BrandPrimaryColor { get; set; }

    [JsonPropertyName("brandAccentColor")]
    public string? BrandAccentColor { get; set; }

    [JsonPropertyName("brandTitle")]
    public string? BrandTitle { get; set; }

    // 앱(작업표시줄/창) 아이콘 data URL. 프론트가 setBrand 로 보내면 저장 → 다음 실행 시 프론트 로드 전에
    // ApplyPersistedBrand 가 창 아이콘으로 미리 적용해, 부팅 직후 작업표시줄이 기본 아이콘으로 깜빡이는 갭 제거.
    [JsonPropertyName("brandIconDataUrl")]
    public string? BrandIconDataUrl { get; set; }

    // ===== 위젯 모드 (데스크톱 보조 always-on-top 창) =====
    // 창 위치·크기·투명도·고정상태를 보존. 0 이면 미설정 → 화면 우측 상단 기본 배치.
    [JsonPropertyName("widgetX")]
    public double WidgetX { get; set; }

    [JsonPropertyName("widgetY")]
    public double WidgetY { get; set; }

    [JsonPropertyName("widgetWidth")]
    public double WidgetWidth { get; set; } = 360;

    [JsonPropertyName("widgetHeight")]
    public double WidgetHeight { get; set; } = 560;

    // 창 불투명도 0.4~1.0. 기본 0.92.
    [JsonPropertyName("widgetOpacity")]
    public double WidgetOpacity { get; set; } = 0.92;

    // 항상 위(Topmost) 고정 여부. 기본 true.
    [JsonPropertyName("widgetPinned")]
    public bool WidgetPinned { get; set; } = true;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static string GetConfigFilePath()
    {
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(local, "Atlas", "config.json");
    }

    public static string GetDefaultDataFolder()
    {
        var docs = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        return Path.Combine(docs, "ProjectManager");
    }

    // 파일이 없거나 손상되면 빈 인스턴스(DataFolder=null) 반환 — 호출자는 ResolveDataFolder() 로 폴백.
    public static BootstrapConfig Load()
    {
        var path = GetConfigFilePath();
        if (!File.Exists(path)) return new BootstrapConfig();
        try
        {
            var json = File.ReadAllText(path);
            return JsonSerializer.Deserialize<BootstrapConfig>(json, JsonOpts) ?? new BootstrapConfig();
        }
        catch
        {
            return new BootstrapConfig();
        }
    }

    public static void Save(BootstrapConfig config)
    {
        var path = GetConfigFilePath();
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var json = JsonSerializer.Serialize(config, JsonOpts);
        File.WriteAllText(path, json);
    }

    // DataFolder 가 비어있거나 공백이면 기본 위치로 폴백.
    public string ResolveDataFolder()
    {
        if (string.IsNullOrWhiteSpace(DataFolder)) return GetDefaultDataFolder();
        return DataFolder!;
    }
}
