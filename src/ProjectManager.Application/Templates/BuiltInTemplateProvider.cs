using System.Reflection;
using System.Text.Json;
using ProjectManager.Core.DTOs;

namespace ProjectManager.Application.Templates;

// 임베디드 JSON(Templates/builtin/*.json)으로 제공되는 빌트인 WBS 템플릿. 싱글톤 — 앱 수명 1회 로드.
// 빌트인은 DB 에 없고 읽기 전용 — key(파일명) 로 식별. PUT/DELETE 불가.
public sealed class BuiltInTemplateProvider
{
    // 빌트인 파일 형태: { name, description, category, nodes: [...] }.
    private sealed record BuiltInFile(
        string Name, string Description, string Category, List<WbsTemplateNodeDto> Nodes);

    public sealed record BuiltInTemplate(
        string Key, string Name, string Description, string Category, IReadOnlyList<WbsTemplateNodeDto> Nodes);

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly IReadOnlyList<BuiltInTemplate> _templates;
    private readonly IReadOnlyDictionary<string, BuiltInTemplate> _byKey;

    public BuiltInTemplateProvider()
    {
        var asm = typeof(BuiltInTemplateProvider).Assembly;
        const string prefix = "ProjectManager.Application.Templates.builtin.";
        const string suffix = ".json";

        var list = new List<BuiltInTemplate>();
        foreach (var resName in asm.GetManifestResourceNames())
        {
            if (!resName.StartsWith(prefix, StringComparison.Ordinal) ||
                !resName.EndsWith(suffix, StringComparison.Ordinal))
                continue;

            using var stream = asm.GetManifestResourceStream(resName);
            if (stream is null) continue;
            var file = JsonSerializer.Deserialize<BuiltInFile>(stream, JsonOpts);
            if (file is null) continue;

            // key = prefix·suffix 제거한 파일명 (예: "sw-waterfall").
            var key = resName.Substring(prefix.Length, resName.Length - prefix.Length - suffix.Length);
            list.Add(new BuiltInTemplate(
                key, file.Name, file.Description, file.Category, file.Nodes ?? new()));
        }

        _templates = list.OrderBy(t => t.Name, StringComparer.CurrentCulture).ToList();
        _byKey = _templates.ToDictionary(t => t.Key, StringComparer.Ordinal);
    }

    public IReadOnlyList<BuiltInTemplate> All() => _templates;

    public BuiltInTemplate? ByKey(string key) =>
        _byKey.TryGetValue(key, out var t) ? t : null;
}
