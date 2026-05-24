namespace ProjectManager.Core.Domain;

public enum IssueStatus { Open, InProgress, Resolved, Closed }
public enum IssuePriority { Low, Medium, High }

public class Issue : IAuditable
{
    public int Id { get; set; }
    public int ProjectId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public IssueStatus Status { get; set; } = IssueStatus.Open;
    public IssuePriority Priority { get; set; } = IssuePriority.Medium;
    public int? AssigneeResourceId { get; set; }
    public DateTime? DueDate { get; set; }
    // 발생일자 — 이슈가 실제로 발생한 시점. 등록일(CreatedAt = 시스템 입력 시각)과 별개로,
    // 과거에 일어난 일을 나중에 등록하는 경우를 위해 사용자가 직접 지정. 선택 필드.
    public DateTime? OccurredOn { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;

    public Project Project { get; set; } = null!;
    public Resource? AssigneeResource { get; set; }
}
