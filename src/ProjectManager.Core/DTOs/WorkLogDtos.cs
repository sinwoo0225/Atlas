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

// 주간 업무일지 통합에 첨부하는 '다음 주 계획' — 프로젝트별:
// 다음 주 시작(StartDate) 예정 WBS + 다음 주 마감(EndDate/DueDate) 미해결 WBS·이슈.
// Reason: "start"(다음 주 시작) | "due"(다음 주 마감). Date 는 yyyy-MM-dd.
public record NextWeekPlanItemDto(
    string Kind, int Id, string Title, string? AssigneeName, string Date, string Reason);

public record NextWeekPlanByProjectDto(
    int ProjectId,
    string ProjectName,
    IReadOnlyList<NextWeekPlanItemDto> Items);
