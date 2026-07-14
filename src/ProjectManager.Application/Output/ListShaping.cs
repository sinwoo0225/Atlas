using System.Text.Json;
using System.Text.Json.Nodes;

namespace ProjectManager.Application.Output;

// list 결과 출력 셰이핑 옵션 — 에이전트 토큰 절감용. 필터로 이미 줄어든 결과에 적용하므로
// "전체 fetch" 문제는 없다(필터는 repository 의 DB-side WHERE 에서 이미 끝남).
//   Count  : 배열 대신 {"count": N} (필터된 전체 개수, Limit 무시)
//   Limit  : 앞에서 N 건만 (기본 정렬 유지)
//   Fields : 지정한 camelCase 필드만 투영 (대소문자 무시). Brief 는 엔티티별 Fields 프리셋의 별칭.
public readonly record struct ListView(bool Count, int? Limit, IReadOnlyList<string>? Fields)
{
    public static readonly ListView Full = new(false, null, null);
}

// CLI BuildList 와 MCP List 가 공유하는 단일 셰이핑 지점. 둘 다 Shape 결과를 자기 직렬화기로 출력한다.
public static class ListShaping
{
    public static object Shape<T>(IEnumerable<T> items, ListView view, JsonSerializerOptions opts)
    {
        var list = items as IReadOnlyList<T> ?? items.ToList();
        if (view.Count) return new { count = list.Count };

        IEnumerable<T> seq = list;
        if (view.Limit is int n && n >= 0) seq = seq.Take(n);
        var limited = seq.ToList();

        if (view.Fields is { Count: > 0 } fields)
            return ProjectFields(limited, fields, opts);
        return limited;
    }

    // DTO → JsonObject(camelCase 키) → 요청 키만 남긴 JsonArray. 엔티티별 코드 0 — 모든 list 에 동일 적용.
    private static JsonArray ProjectFields<T>(IReadOnlyList<T> list, IReadOnlyList<string> fields, JsonSerializerOptions opts)
    {
        var wanted = new HashSet<string>(fields, StringComparer.OrdinalIgnoreCase);
        var arr = new JsonArray();
        foreach (var item in list)
        {
            if (JsonSerializer.SerializeToNode(item, opts) is not JsonObject node) continue;
            var picked = new JsonObject();
            foreach (var kv in node)
                if (wanted.Contains(kv.Key))
                    picked[kv.Key] = kv.Value?.DeepClone();
            arr.Add(picked);
        }
        return arr;
    }
}

// --brief 가 사용하는 엔티티별 축약 필드셋 — CLI 와 MCP 가 같은 값을 쓰도록 한 곳에 둔다.
// 키는 각 DTO 의 camelCase 직렬화 속성명과 일치해야 한다.
public static class BriefPresets
{
    public static readonly string[] Issue =
        { "id", "projectId", "title", "status", "priority", "assigneeName", "dueDate" };

    // kind 는 축약 뷰에도 넣는다 — Group 이면 status/assignee 가 무의미하므로, 그게 안 보이면 에이전트가 오독한다.
    public static readonly string[] Wbs =
        { "id", "projectId", "parentId", "name", "kind", "status", "assignee", "startDate", "endDate", "isMilestone" };

    public static readonly string[] Project =
        { "id", "name", "status", "category", "startDate", "endDate" };

    public static readonly string[] Meeting =
        { "id", "projectId", "date", "topic", "category", "attendees" };

    // content 는 큰 필드라 brief 에서 제외(토큰 절감 목적). 내용은 get --id 또는 --fields 로.
    public static readonly string[] ChangeLog =
        { "id", "projectId", "date", "impact" };

    public static readonly string[] DevInfo =
        { "id", "projectId", "title", "type", "tags", "updatedAt" };

    public static readonly string[] Resource =
        { "id", "name", "type", "department", "email" };
}
