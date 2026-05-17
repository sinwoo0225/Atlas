using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ProjectManager.Cli.Commands;

// CLI 출력 규약: stdout = 성공 시 JSON 한 줄(또는 ATLAS_CLI_PRETTY=1 일 때 들여쓰기),
// stderr = 에러 시 {"error":"...","code":"..."} + exit code != 0. PowerShell ConvertFrom-Json 으로 파싱 가능.
internal static class CliJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        Converters = { new JsonStringEnumConverter() },
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = Environment.GetEnvironmentVariable("ATLAS_CLI_PRETTY") == "1",
        ReferenceHandler = ReferenceHandler.IgnoreCycles,
        // 한글이 \uXXXX 로 escape 되지 않게 — JSON 표준 안 한글 그대로 허용.
        // Console.OutputEncoding 이 UTF-8 이므로 안전.
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public static void WriteSuccess(object? value)
    {
        Console.WriteLine(JsonSerializer.Serialize(value, Options));
    }

    public static int WriteError(string code, string message)
    {
        var payload = JsonSerializer.Serialize(new { error = message, code }, Options);
        Console.Error.WriteLine(payload);
        return 1;
    }

    public static int WriteException(Exception ex)
    {
        // 미처리 예외는 unhandled — 메시지만 노출하고 stack 은 stderr 에 별도 라인으로(디버깅용).
        Console.Error.WriteLine(JsonSerializer.Serialize(
            new { error = ex.Message, code = "unhandled" }, Options));
        Console.Error.WriteLine(ex.ToString());
        return 2;
    }
}
