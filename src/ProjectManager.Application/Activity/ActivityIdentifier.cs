using ProjectManager.Core.Domain;

namespace ProjectManager.Application.Activity;

// IAuditable 엔티티 한 개로부터 ActivityLog 의 EntityType/EntityId/EntityTitle/ProjectId 를 뽑아낸다.
// Resource 는 프로젝트에 안 묶이므로 ProjectId = null. Project 는 자기 자신이 프로젝트이므로 ProjectId = Id.
public static class ActivityIdentifier
{
    public readonly record struct Identity(int? ProjectId, string EntityType, int EntityId, string Title);

    public static Identity? Identify(object entity) => entity switch
    {
        Project p => new(p.Id, "Project", p.Id, p.Name),
        WbsItem w => new(w.ProjectId, "WbsItem", w.Id, w.Name),
        ChangeLog c => new(c.ProjectId, "ChangeLog", c.Id, TrimFirstLine(c.Content, 80)),
        Meeting m => new(m.ProjectId, "Meeting", m.Id, m.Topic),
        DevInfoItem d => new(d.ProjectId, "DevInfoItem", d.Id, d.Title),
        Resource r => new(null, "Resource", r.Id, r.Name),
        Issue i => new(i.ProjectId, "Issue", i.Id, i.Title),
        WorkLog wl => new(wl.ProjectId, "WorkLog", wl.Id, $"{wl.Date:yyyy-MM-dd} 업무일지"),
        _ => null,
    };

    // 첫 줄만 추출 + 길이 cap. EntityTitle 와 필드 diff 의 장문 텍스트 truncation 양쪽에서 사용.
    public static string TrimFirstLine(string s, int max)
    {
        if (string.IsNullOrEmpty(s)) return string.Empty;
        var first = s.Split('\n', 2)[0].Trim();
        return first.Length > max ? first[..max] : first;
    }
}
