using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ProjectManager.Core.Domain;
using ProjectManager.Infrastructure.Persistence;

namespace ProjectManager.Application.Search;

// 엔티티 -> IndexRow 변환. Meeting 의 JSON-in-TEXT 컬럼 (Attendees / Decisions / ActionItems)
// 은 MeetingMarkdownExporter 와 동일한 파싱 규약으로 평탄화한다. legacy plain-text 도 그대로 포함.
internal static class SearchIndexer
{
    public const string TypeProject = "Project";
    public const string TypeWbsItem = "WbsItem";
    public const string TypeIssue = "Issue";
    public const string TypeMeeting = "Meeting";
    public const string TypeChangeLog = "ChangeLog";
    public const string TypeDevInfoItem = "DevInfoItem";
    public const string TypeWorkLog = "WorkLog";

    public static readonly string[] AllTypes =
    {
        TypeProject, TypeWbsItem, TypeIssue, TypeMeeting,
        TypeChangeLog, TypeDevInfoItem, TypeWorkLog
    };

    public static IndexRow? ToRow(object entity, AppDbContext db) => entity switch
    {
        Project p => FromProject(p),
        WbsItem w => FromWbsItem(w),
        Issue i => FromIssue(i, db),
        Meeting m => FromMeeting(m),
        ChangeLog c => FromChangeLog(c),
        DevInfoItem d => FromDevInfo(d),
        WorkLog wl => FromWorkLog(wl),
        _ => null
    };

    public static (string Type, int Id)? Identify(object entity) => entity switch
    {
        Project p => (TypeProject, p.Id),
        WbsItem w => (TypeWbsItem, w.Id),
        Issue i => (TypeIssue, i.Id),
        Meeting m => (TypeMeeting, m.Id),
        ChangeLog c => (TypeChangeLog, c.Id),
        DevInfoItem d => (TypeDevInfoItem, d.Id),
        WorkLog wl => (TypeWorkLog, wl.Id),
        _ => null
    };

    private static IndexRow FromProject(Project p) => new(
        TypeProject, p.Id, null,
        Title: p.Name,
        Body: Combine(p.Description, p.Goal, p.Participants, p.Deliverables, p.RelatedLinks),
        UpdatedAt: p.UpdatedAt);

    private static IndexRow FromWbsItem(WbsItem w) => new(
        TypeWbsItem, w.Id, w.ProjectId,
        Title: w.Name,
        Body: Combine(w.Notes, w.Assignee),
        UpdatedAt: w.UpdatedAt);

    private static IndexRow FromIssue(Issue i, AppDbContext db)
    {
        var assigneeName = i.AssigneeResource?.Name
            ?? (i.AssigneeResourceId.HasValue
                ? db.Resources.AsNoTracking()
                    .Where(r => r.Id == i.AssigneeResourceId.Value)
                    .Select(r => r.Name)
                    .FirstOrDefault()
                : null);
        return new IndexRow(
            TypeIssue, i.Id, i.ProjectId,
            Title: i.Title,
            Body: Combine(i.Description, assigneeName, i.Category),
            UpdatedAt: i.UpdatedAt);
    }

    private static IndexRow FromMeeting(Meeting m) => new(
        TypeMeeting, m.Id, m.ProjectId,
        Title: m.Topic,
        Body: Combine(
            m.Discussion,
            FlattenMeetingAttendees(m.Attendees),
            FlattenMeetingDecisions(m.Decisions),
            FlattenMeetingActionItems(m.ActionItems)),
        UpdatedAt: m.UpdatedAt);

    private static IndexRow FromChangeLog(ChangeLog c)
    {
        var title = string.IsNullOrEmpty(c.Content)
            ? $"변경 #{c.Id}"
            : (c.Content.Length > 80 ? c.Content[..80] : c.Content);
        return new IndexRow(
            TypeChangeLog, c.Id, c.ProjectId,
            Title: title,
            Body: Combine(c.Content, c.CreatedBy, c.UpdatedBy, c.RelatedDocLinks),
            UpdatedAt: c.UpdatedAt);
    }

    private static IndexRow FromDevInfo(DevInfoItem d) => new(
        TypeDevInfoItem, d.Id, d.ProjectId,
        Title: d.Title,
        Body: Combine(d.Content, d.Tags, d.Url),
        UpdatedAt: d.UpdatedAt);

    private static IndexRow FromWorkLog(WorkLog wl) => new(
        TypeWorkLog, wl.Id, wl.ProjectId,
        Title: $"{wl.Date:yyyy-MM-dd} 업무일지",
        Body: Combine(wl.Done, wl.Plan, wl.Issues),
        UpdatedAt: wl.UpdatedAt);

    private static string Combine(params string?[] parts) =>
        string.Join(" \n ", parts.Where(s => !string.IsNullOrWhiteSpace(s)));

    // ---- Meeting JSON 평탄화 (MeetingMarkdownExporter 의 Format* 와 동일 규약, 단 마크다운 X) ----

    private static string FlattenMeetingAttendees(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind == JsonValueKind.Array)
            {
                var sb = new StringBuilder();
                foreach (var el in doc.RootElement.EnumerateArray())
                {
                    if (el.ValueKind != JsonValueKind.Object) continue;
                    var org = el.TryGetProperty("org", out var o) ? o.GetString() : null;
                    if (!string.IsNullOrEmpty(org)) sb.Append(org).Append(' ');
                    if (el.TryGetProperty("members", out var mems) && mems.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var mEl in mems.EnumerateArray())
                            if (mEl.ValueKind == JsonValueKind.String)
                                sb.Append(mEl.GetString()).Append(' ');
                    }
                }
                if (sb.Length > 0) return sb.ToString();
            }
        }
        catch { }
        return raw;
    }

    private static string FlattenMeetingDecisions(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind == JsonValueKind.Array)
                return string.Join(" \n ",
                    doc.RootElement.EnumerateArray()
                        .Where(el => el.ValueKind == JsonValueKind.String)
                        .Select(el => el.GetString() ?? string.Empty));
        }
        catch { }
        return raw;
    }

    private static string FlattenMeetingActionItems(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind == JsonValueKind.Array)
            {
                var sb = new StringBuilder();
                foreach (var el in doc.RootElement.EnumerateArray())
                {
                    if (el.ValueKind != JsonValueKind.Object) continue;
                    if (el.TryGetProperty("content", out var c) && c.ValueKind == JsonValueKind.String)
                        sb.Append(c.GetString()).Append(' ');
                    if (el.TryGetProperty("assignee", out var a) && a.ValueKind == JsonValueKind.String)
                        sb.Append(a.GetString()).Append(' ');
                    if (el.TryGetProperty("deadline", out var d) && d.ValueKind == JsonValueKind.String)
                        sb.Append(d.GetString()).Append(' ');
                }
                if (sb.Length > 0) return sb.ToString();
            }
        }
        catch { }
        return raw;
    }
}
