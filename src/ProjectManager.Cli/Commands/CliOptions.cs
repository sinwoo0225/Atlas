using System.CommandLine;
using System.CommandLine.Parsing;
using System.Globalization;
using ProjectManager.Application.Output;

namespace ProjectManager.Cli.Commands;

// 공용 옵션 팩토리 — 다중값 enum 필터, today/now 날짜 키워드, list 출력 셰이핑(count/limit/brief/fields).
// System.CommandLine 의 Option 은 한 Command 에만 add 가능하므로 매 BuildList 호출마다 새 인스턴스를 만든다.
internal static class CliOptions
{
    // 다중값 enum 옵션. `--status Open --status InProgress`(반복) · `--status Open InProgress`(공백) ·
    // `--status Open,InProgress`(콤마) 모두 허용. 대소문자 무시. 오타는 명확한 파싱 에러.
    public static Option<T[]> EnumList<T>(string name, string description) where T : struct, Enum
    {
        var opt = new Option<T[]>(
            name,
            parseArgument: result =>
            {
                var values = new List<T>();
                foreach (var tok in result.Tokens)
                foreach (var part in tok.Value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                {
                    if (Enum.TryParse<T>(part, ignoreCase: true, out var v)) values.Add(v);
                    else
                    {
                        result.ErrorMessage =
                            $"'{part}' 은(는) 유효한 {typeof(T).Name} 값이 아닙니다. 가능: {string.Join("|", Enum.GetNames<T>())}";
                        return Array.Empty<T>();
                    }
                }
                return values.ToArray();
            },
            description: description)
        { AllowMultipleArgumentsPerToken = true };
        return opt;
    }

    // 다중값 문자열 옵션. `--tag a --tag b`(반복) · `--tag a,b`(콤마) 모두 허용. 빈 토큰 제거.
    public static Option<string[]> StringList(string name, string description)
    {
        var opt = new Option<string[]>(
            name,
            parseArgument: result => result.Tokens
                .SelectMany(t => t.Value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                .ToArray(),
            description: description)
        { AllowMultipleArgumentsPerToken = true };
        return opt;
    }

    // today|now → 실행 시점 DateTime.Today, 그 외 ISO YYYY-MM-DD. (System.CommandLine 기본 DateTime 파서는 today 를 못 읽음.)
    public static Option<DateTime?> DateOrKeyword(string name, string description)
    {
        return new Option<DateTime?>(
            name,
            parseArgument: result =>
            {
                if (result.Tokens.Count == 0) return null;
                var raw = result.Tokens[0].Value.Trim();
                if (raw.Equals("today", StringComparison.OrdinalIgnoreCase) ||
                    raw.Equals("now", StringComparison.OrdinalIgnoreCase))
                    return DateTime.Today;
                if (DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
                    return d.Date;
                result.ErrorMessage = $"'{raw}' 날짜 파싱 실패 — today|now 또는 YYYY-MM-DD 형식이어야 합니다.";
                return null;
            },
            description: description);
    }
}

// list 명령 공통 출력 셰이핑 옵션 묶음. BuildList 안에서 `var view = new ListViewOptions(); view.AddTo(cmd);`
// 한 뒤 핸들러에서 `view.Read(ctx.ParseResult, BriefPresets.Xxx)` 로 ListView 를 얻어 CliJson.WriteList 에 넘긴다.
internal sealed class ListViewOptions
{
    public readonly Option<bool> Count = new("--count", "결과 배열 대신 개수만 {\"count\":N}");
    public readonly Option<int?> Limit = new(new[] { "--limit", "--take" }, "최대 N 건만 (기본 전체)");
    public readonly Option<bool> Brief = new("--brief", "축약 필드만 (id·제목·상태·날짜 등)");
    public readonly Option<string?> Fields = new("--fields", "쉼표구분 필드만 투영 (예: id,title,status)");

    public void AddTo(Command c)
    {
        c.AddOption(Count);
        c.AddOption(Limit);
        c.AddOption(Brief);
        c.AddOption(Fields);
    }

    public ListView Read(ParseResult pr, IReadOnlyList<string> briefPreset)
    {
        var fieldsRaw = pr.GetValueForOption(Fields);
        IReadOnlyList<string>? fields =
            !string.IsNullOrWhiteSpace(fieldsRaw)
                ? fieldsRaw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                : (pr.GetValueForOption(Brief) ? briefPreset : null);
        return new ListView(pr.GetValueForOption(Count), pr.GetValueForOption(Limit), fields);
    }
}
