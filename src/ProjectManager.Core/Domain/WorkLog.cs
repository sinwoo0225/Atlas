namespace ProjectManager.Core.Domain;

public class WorkLog
{
    public int Id { get; set; }
    public int ProjectId { get; set; }
    public DateTime Date { get; set; }
    public string Done { get; set; } = string.Empty;
    public string Plan { get; set; } = string.Empty;
    public string Issues { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Project Project { get; set; } = null!;
}
