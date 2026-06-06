using System.Text.Json;
using ProjectManager.Application.Output;

namespace ProjectManager.Cli.Commands;

// CLI 출력 규약: stdout = 성공 시 JSON 한 줄(또는 ATLAS_CLI_PRETTY=1 일 때 들여쓰기),
// stderr = 에러 시 {"error":"...","code":"..."} + exit code != 0. PowerShell ConvertFrom-Json 으로 파싱 가능.
internal static class CliJson
{
    // 직렬화 옵션 본체는 AtlasJson(Application) 공유 — MCP 와 동일. 들여쓰기만 ATLAS_CLI_PRETTY 로 분기.
    public static readonly JsonSerializerOptions Options =
        AtlasJson.CreateOptions(Environment.GetEnvironmentVariable("ATLAS_CLI_PRETTY") == "1");

    public static void WriteSuccess(object? value)
    {
        Console.WriteLine(JsonSerializer.Serialize(value, Options));
    }

    // list 결과를 셰이핑(count/limit/brief/fields)해 출력. 셰이핑 로직은 ListShaping 공유.
    public static void WriteList<T>(IEnumerable<T> items, ListView view) =>
        WriteSuccess(ListShaping.Shape(items, view, Options));

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
