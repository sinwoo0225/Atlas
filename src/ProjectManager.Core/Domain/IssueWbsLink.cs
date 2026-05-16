namespace ProjectManager.Core.Domain;

// Issue ↔ WbsItem 다대다 조인. 단순 링크 (관계 타입 없음 — 후속 백로그).
// IAuditable 이라 ActivityLogInterceptor 가 추가/삭제를 자동 캡처.
public class IssueWbsLink : IAuditable
{
    public int Id { get; set; }
    public int IssueId { get; set; }
    public int WbsItemId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;

    public Issue Issue { get; set; } = null!;
    public WbsItem WbsItem { get; set; } = null!;
}
