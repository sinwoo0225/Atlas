using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace ProjectManager.Mcp;

// MCP 도구 응답 직렬화 — 사이클 6 CliJson 과 동일 옵션 (UnsafeRelaxedJsonEscaping 으로 한글
// \uXXXX escape 안 함, IgnoreCycles 로 EF navigation 안전, CamelCase + WhenWritingNull + JsonStringEnumConverter).
// CLI 와 달리 stderr/exit code 는 없음 — MCP SDK 가 도구 메서드의 예외를 isError 응답으로 자동 변환.
internal static class McpJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        Converters = { new JsonStringEnumConverter() },
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        ReferenceHandler = ReferenceHandler.IgnoreCycles,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public static string Serialize(object? value) =>
        JsonSerializer.Serialize(value, Options);

    // ActionItems 처럼 DB 가 JSON-in-TEXT string 인 필드 — 응답에서는 객체로 풀어 줌.
    // 입력이 invalid JSON 이면 raw string 그대로 노출 (LLM 이 진단 가능).
    public static JsonNode? TryParseJson(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        try { return JsonNode.Parse(raw); }
        catch { return JsonValue.Create(raw); }
    }
}
