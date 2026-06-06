namespace ProjectManager.Core.Domain;

// 회의 성격 — 내부(자사) / 외부(고객·협력사 동반). 기본 Internal.
public enum MeetingCategory { Internal, External }

public class Meeting : IAuditable
{
    public int Id { get; set; }
    public int ProjectId { get; set; }
    public DateTime Date { get; set; }
    public string? StartTime { get; set; }
    public string? EndTime { get; set; }
    public MeetingCategory Category { get; set; } = MeetingCategory.Internal;
    public string Attendees { get; set; } = string.Empty;
    public string Topic { get; set; } = string.Empty;
    public string Decisions { get; set; } = string.Empty;
    public string Discussion { get; set; } = string.Empty;
    public string ActionItems { get; set; } = string.Empty;
    // 저장 시 자동 export 된 md 파일의 절대경로 (없으면 null).
    public string? MarkdownPath { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;

    public Project Project { get; set; } = null!;
}
