using System.Text.Json;
using System.Text.Json.Nodes;
using ProjectManager.Application.Output;

namespace ProjectManager.Mcp;

// MCP 도구 응답 직렬화 — CLI(CliJson) 와 동일 옵션을 AtlasJson(Application) 공유에서 가져온다
// (UnsafeRelaxedJsonEscaping 한글 그대로, IgnoreCycles EF navigation 안전, CamelCase + WhenWritingNull + enum 문자열).
// CLI 와 달리 stderr/exit code 는 없음 — MCP SDK 가 도구 메서드의 예외를 isError 응답으로 자동 변환.
internal static class McpJson
{
    public static readonly JsonSerializerOptions Options = AtlasJson.CreateOptions(indented: false);

    public static string Serialize(object? value) =>
        JsonSerializer.Serialize(value, Options);

    // list 결과를 셰이핑(count/limit/brief/fields)해 직렬화. 셰이핑 로직은 ListShaping 공유.
    public static string SerializeList<T>(IEnumerable<T> items, ListView view) =>
        Serialize(ListShaping.Shape(items, view, Options));

    // 도구 파라미터(count/limit/brief/fields) → ListView. fields(쉼표구분) 우선, 없으면 brief→프리셋.
    public static ListView View(bool count, int? limit, bool brief, string? fields, IReadOnlyList<string> briefPreset)
    {
        IReadOnlyList<string>? f =
            !string.IsNullOrWhiteSpace(fields)
                ? fields.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                : (brief ? briefPreset : null);
        return new ListView(count, limit, f);
    }

    // ActionItems 처럼 DB 가 JSON-in-TEXT string 인 필드 — 응답에서는 객체로 풀어 줌.
    // 입력이 invalid JSON 이면 raw string 그대로 노출 (LLM 이 진단 가능).
    public static JsonNode? TryParseJson(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        try { return JsonNode.Parse(raw); }
        catch { return JsonValue.Create(raw); }
    }
}
