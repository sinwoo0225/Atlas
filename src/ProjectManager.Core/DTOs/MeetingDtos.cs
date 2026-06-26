using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

public record MeetingDto(
    int Id, int ProjectId, DateTime Date,
    string? StartTime, string? EndTime,
    MeetingCategory Category,
    string Attendees, string Topic, string Decisions,
    string Discussion, string ActionItems,
    string? MarkdownPath,
    DateTime CreatedAt, DateTime UpdatedAt,
    bool IsFavorite = false);

public record CreateMeetingDto(
    int ProjectId, DateTime Date,
    string? StartTime, string? EndTime,
    MeetingCategory Category,
    string Attendees,
    string Topic, string Decisions, string Discussion, string ActionItems);

public record UpdateMeetingDto(
    DateTime Date,
    string? StartTime, string? EndTime,
    MeetingCategory Category,
    string Attendees, string Topic,
    string Decisions, string Discussion, string ActionItems,
    DateTime UpdatedAt);
