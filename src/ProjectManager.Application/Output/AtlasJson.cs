using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ProjectManager.Application.Output;

// CLI(CliJson) 와 MCP(McpJson) 가 공유하는 단일 JSON 직렬화 옵션 소스 — 과거 두 곳에 복제돼 있던
// 옵션을 한 곳으로 모아 drift 를 막는다. CamelCase + WhenWritingNull + JsonStringEnumConverter
// (enum 을 문자열로) + IgnoreCycles (EF navigation 안전) + UnsafeRelaxedJsonEscaping (한글 \uXXXX 안 함,
// stdout/응답이 UTF-8 이므로 안전). 들여쓰기만 호출자별로 다르다(CLI 는 ATLAS_CLI_PRETTY, MCP 는 항상 off).
public static class AtlasJson
{
    public static JsonSerializerOptions CreateOptions(bool indented = false) => new()
    {
        Converters = { new JsonStringEnumConverter() },
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = indented,
        ReferenceHandler = ReferenceHandler.IgnoreCycles,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };
}
