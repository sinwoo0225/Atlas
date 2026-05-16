namespace ProjectManager.Core.Domain;

public enum ImpactLevel { Low, Medium, High, Critical }

public class ChangeLog : IAuditable
{
    public int Id { get; set; }
    public int ProjectId { get; set; }
    public DateTime Date { get; set; } = DateTime.UtcNow;
    public string Content { get; set; } = string.Empty;
    public ImpactLevel Impact { get; set; } = ImpactLevel.Low;
    public string RelatedDocLinks { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;

    public Project Project { get; set; } = null!;
}
