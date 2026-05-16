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
    // 출처 추적: 어느 Issue/WBS 작업이 이 변경의 원인인지. 둘 다 nullable 독립 — 동시 가능.
    // OnDelete.SetNull → 원본 삭제되어도 ChangeLog 본체는 감사 자료로 보존, 출처만 비워짐.
    public int? SourceIssueId { get; set; }
    public int? SourceWbsItemId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;

    public Project Project { get; set; } = null!;
    public Issue? SourceIssue { get; set; }
    public WbsItem? SourceWbsItem { get; set; }
}
