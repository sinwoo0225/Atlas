namespace ProjectManager.Core.DTOs;

// 시작 화면 위젯(E-2). across-project myOpenItems + dueSoonItems 를 한 endpoint 로.
// recent 위젯은 frontend localStorage 만 사용 (백엔드 무관).
public record StartPageDto(
    IReadOnlyList<StartPageItemDto> MyOpenItems,
    IReadOnlyList<StartPageItemDto> DueSoonItems);

public record StartPageItemDto(
    string Kind,            // "issue" | "wbs"
    int Id,
    int ProjectId,
    string ProjectName,
    string Title,           // Issue.Title 또는 WBS.Name
    string Status,
    string? Priority,       // Issue 만 — High/Medium/Low. WBS 는 null
    DateTime? DueDate);     // Issue.DueDate 또는 WBS.EndDate
