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
