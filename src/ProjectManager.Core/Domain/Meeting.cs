namespace ProjectManager.Core.Domain;

public class Meeting
{
    public int Id { get; set; }
    public int ProjectId { get; set; }
    public DateTime Date { get; set; }
    public string? StartTime { get; set; }
    public string? EndTime { get; set; }
    public string Attendees { get; set; } = string.Empty;
    public string Topic { get; set; } = string.Empty;
    public string Decisions { get; set; } = string.Empty;
    public string Discussion { get; set; } = string.Empty;
    public string ActionItems { get; set; } = string.Empty;
    // 저장 시 자동 export 된 md 파일의 절대경로 (없으면 null).
    public string? MarkdownPath { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Project Project { get; set; } = null!;
}
