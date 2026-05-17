namespace ProjectManager.Core.Domain;

// 링크의 의미. RelatesTo (기본) / Blocks (차단) / ParentOf (Issue 가 WBS 의 부모 의미).
// 양방향에서 같은 라벨로 보임 — 단지 의미만 다름. 방향성은 (IssueId, WbsItemId) 자체에 내재.
public enum IssueWbsLinkType { RelatesTo, Blocks, ParentOf }

// Issue ↔ WbsItem 다대다 조인. Type 으로 관계 의미 표현 (사이클 5 에서 추가).
// IAuditable 이라 ActivityLogInterceptor 가 추가/삭제/Type 변경 자동 캡처.
public class IssueWbsLink : IAuditable
{
    public int Id { get; set; }
    public int IssueId { get; set; }
    public int WbsItemId { get; set; }
    public IssueWbsLinkType Type { get; set; } = IssueWbsLinkType.RelatesTo;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;

    public Issue Issue { get; set; } = null!;
    public WbsItem WbsItem { get; set; } = null!;
}
