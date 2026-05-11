namespace ProjectManager.Core.DTOs;

public record MeetingDto(
    int Id, int ProjectId, DateTime Date,
    string Attendees, string Topic, string Decisions,
    string Discussion, string ActionItems,
    DateTime CreatedAt, DateTime UpdatedAt);

public record CreateMeetingDto(
    int ProjectId, DateTime Date, string Attendees,
    string Topic, string Decisions, string Discussion, string ActionItems);

public record UpdateMeetingDto(
    DateTime Date, string Attendees, string Topic,
    string Decisions, string Discussion, string ActionItems);
