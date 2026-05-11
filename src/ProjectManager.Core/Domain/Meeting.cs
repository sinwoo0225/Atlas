namespace ProjectManager.Core.Domain;

public class Meeting
{
    public int Id { get; set; }
    public int ProjectId { get; set; }
    public DateTime Date { get; set; }
    public string Attendees { get; set; } = string.Empty;
    public string Topic { get; set; } = string.Empty;
    public string Decisions { get; set; } = string.Empty;
    public string Discussion { get; set; } = string.Empty;
    public string ActionItems { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Project Project { get; set; } = null!;
}
