namespace ProjectManager.Core.DTOs;

public record WorkLogDto(
    int Id, int ProjectId, DateTime Date,
    string Done, string Plan, string Issues,
    DateTime CreatedAt, DateTime UpdatedAt);

public record UpsertWorkLogDto(string Done, string Plan, string Issues);

public record WeeklyWorkLogDayDto(
    int DayIndex,
    string DayLabel,
    string Date,
    string Done,
    string Plan,
    string Issues);

public record WeeklyWorkLogProjectDto(
    int ProjectId,
    string ProjectName,
    IEnumerable<WeeklyWorkLogDayDto> Days);

public record WeeklyWorkLogDto(
    DateTime WeekStart,
    IEnumerable<WeeklyWorkLogProjectDto> Projects);

// 주간 업무일지 통합에 첨부하는 '이슈 목록' — 프로젝트별 미해결(Open·InProgress) 이슈.
public record OpenIssueDto(int Id, string Title, string Description, string? AssigneeName);

public record OpenIssuesByProjectDto(
    int ProjectId,
    string ProjectName,
    IReadOnlyList<OpenIssueDto> Issues);
