using System.Text;
using System.Text.Json;
using ProjectManager.Core.Domain;
using ProjectManager.Infrastructure.Config;

namespace ProjectManager.Application.Services;

// 회의록 저장 시 데이터 폴더의 <projectFolder>/Meetings/ 에 사람이 읽을 수 있는 md 파일을 생성한다.
// DB 가 source-of-truth, md 는 자동 export. 외부에서 md 를 수정해도 다음 저장이 덮어쓴다.
public class MeetingMarkdownExporter(PathResolver pathResolver)
{
    public async Task<string?> SaveAsync(Project project, Meeting meeting)
    {
        if (string.IsNullOrEmpty(project.FolderPath)) return null;
        try
        {
            var folder = pathResolver.GetMeetingsFolder(project.FolderPath);
            var fileName = BuildFileName(meeting);
            var path = Path.Combine(folder, fileName);
            var content = BuildContent(project, meeting);
            await File.WriteAllTextAsync(path, content, new UTF8Encoding(false));
            return path;
        }
        catch
        {
            return null;
        }
    }

    public Task DeleteAsync(string? markdownPath)
    {
        if (string.IsNullOrEmpty(markdownPath)) return Task.CompletedTask;
        try { if (File.Exists(markdownPath)) File.Delete(markdownPath); } catch { }
        return Task.CompletedTask;
    }

    private static string BuildFileName(Meeting m)
    {
        var dateStr = m.Date.ToString("yyyy-MM-dd");
        var topic = string.Concat((m.Topic ?? string.Empty).Split(Path.GetInvalidFileNameChars())).Trim();
        if (string.IsNullOrWhiteSpace(topic)) topic = $"meeting_{m.Id}";
        if (topic.Length > 80) topic = topic[..80];
        return $"{dateStr}_{topic}.md";
    }

    private static string BuildContent(Project project, Meeting m)
    {
        var sb = new StringBuilder();
        sb.AppendLine("---");
        sb.AppendLine("type: meeting");
        sb.AppendLine($"id: {m.Id}");
        sb.AppendLine($"project: {EscapeYamlScalar(project.Name)}");
        sb.AppendLine($"date: {m.Date:yyyy-MM-dd}");
        if (!string.IsNullOrEmpty(m.StartTime) || !string.IsNullOrEmpty(m.EndTime))
            sb.AppendLine($"time: \"{m.StartTime ?? string.Empty} ~ {m.EndTime ?? string.Empty}\"");
        sb.AppendLine($"category: {(m.Category == MeetingCategory.External ? "external" : "internal")}");
        sb.AppendLine("---");
        sb.AppendLine();

        sb.AppendLine($"# {(string.IsNullOrEmpty(m.Topic) ? "(제목 없음)" : m.Topic)}");
        sb.AppendLine();

        sb.AppendLine("## 일시");
        var timePart = (!string.IsNullOrEmpty(m.StartTime) || !string.IsNullOrEmpty(m.EndTime))
            ? $" {m.StartTime ?? string.Empty} ~ {m.EndTime ?? string.Empty}"
            : string.Empty;
        sb.AppendLine($"{m.Date:yyyy-MM-dd}{timePart}");
        sb.AppendLine();

        sb.AppendLine("## 구분");
        sb.AppendLine(m.Category == MeetingCategory.External ? "외부" : "내부");
        sb.AppendLine();

        sb.AppendLine("## 참석자");
        sb.AppendLine(FormatAttendees(m.Attendees));
        sb.AppendLine();

        sb.AppendLine("## 결정사항");
        sb.AppendLine(FormatDecisions(m.Decisions));
        sb.AppendLine();

        sb.AppendLine("## 액션아이템");
        sb.AppendLine(FormatActionItems(m.ActionItems));
        sb.AppendLine();

        sb.AppendLine("## 논의 내용");
        sb.AppendLine();
        sb.AppendLine(string.IsNullOrEmpty(m.Discussion) ? "_(내용 없음)_" : m.Discussion);

        return sb.ToString();
    }

    // 참석자 — AttendeeOrg[] = [{ org, members[] }] JSON 우선, 실패 시 plain text.
    private static string FormatAttendees(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "_(없음)_";
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind == JsonValueKind.Array)
            {
                var sb = new StringBuilder();
                var any = false;
                foreach (var el in doc.RootElement.EnumerateArray())
                {
                    if (el.ValueKind != JsonValueKind.Object) continue;
                    var org = el.TryGetProperty("org", out var orgEl) ? orgEl.GetString() ?? string.Empty : string.Empty;
                    var members = new List<string>();
                    if (el.TryGetProperty("members", out var mems) && mems.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var mEl in mems.EnumerateArray())
                            if (mEl.ValueKind == JsonValueKind.String) members.Add(mEl.GetString() ?? string.Empty);
                    }
                    if (string.IsNullOrEmpty(org) && members.Count == 0) continue;
                    sb.Append("- ");
                    if (!string.IsNullOrEmpty(org)) sb.Append(org).Append(": ");
                    sb.AppendLine(string.Join(", ", members));
                    any = true;
                }
                if (any) return sb.ToString().TrimEnd();
            }
        }
        catch { }
        return raw;
    }

    private static string FormatDecisions(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "_(없음)_";
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind == JsonValueKind.Array)
            {
                var lines = doc.RootElement.EnumerateArray()
                    .Where(el => el.ValueKind == JsonValueKind.String)
                    .Select(el => "- " + (el.GetString() ?? string.Empty));
                var joined = string.Join("\n", lines);
                if (!string.IsNullOrWhiteSpace(joined)) return joined;
            }
        }
        catch { }
        var parts = raw.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length == 0) return raw;
        return string.Join("\n", parts.Select(p => p.StartsWith("- ") ? p : $"- {p}"));
    }

    private static string FormatActionItems(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "_(없음)_";
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind == JsonValueKind.Array)
            {
                var sb = new StringBuilder();
                var any = false;
                foreach (var el in doc.RootElement.EnumerateArray())
                {
                    if (el.ValueKind != JsonValueKind.Object) continue;
                    var content = el.TryGetProperty("content", out var c) ? c.GetString() ?? string.Empty : string.Empty;
                    var assignee = el.TryGetProperty("assignee", out var a) ? a.GetString() ?? string.Empty : string.Empty;
                    var deadline = el.TryGetProperty("deadline", out var d) ? d.GetString() ?? string.Empty : string.Empty;
                    sb.Append("- [ ] ").Append(content);
                    var tail = new List<string>();
                    if (!string.IsNullOrEmpty(assignee)) tail.Add($"담당: {assignee}");
                    if (!string.IsNullOrEmpty(deadline)) tail.Add($"마감: {deadline}");
                    if (tail.Count > 0) sb.Append(" — ").Append(string.Join(", ", tail));
                    sb.AppendLine();
                    any = true;
                }
                if (any) return sb.ToString().TrimEnd();
            }
        }
        catch { }
        return raw;
    }

    private static string EscapeYamlScalar(string s)
    {
        if (string.IsNullOrEmpty(s)) return "\"\"";
        return "\"" + s.Replace("\"", "\\\"") + "\"";
    }
}
