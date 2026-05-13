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
