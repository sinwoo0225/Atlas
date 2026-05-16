namespace ProjectManager.Core.Domain;

public enum ProjectStatus { Planned, Waiting, InProgress, Done }

public class Project : IAuditable
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Goal { get; set; } = string.Empty;
    public ProjectStatus Status { get; set; } = ProjectStatus.Planned;
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public decimal? Budget { get; set; }
    public string Participants { get; set; } = string.Empty;
    public string Deliverables { get; set; } = string.Empty;
    public string RelatedLinks { get; set; } = string.Empty;
    public string FolderPath { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;

    public ICollection<WbsItem> WbsItems { get; set; } = new List<WbsItem>();
    public ICollection<ChangeLog> ChangeLogs { get; set; } = new List<ChangeLog>();
    public ICollection<Meeting> Meetings { get; set; } = new List<Meeting>();
    public ICollection<DevInfoItem> DevInfoItems { get; set; } = new List<DevInfoItem>();
    public ICollection<WbsVersion> WbsVersions { get; set; } = new List<WbsVersion>();
}
