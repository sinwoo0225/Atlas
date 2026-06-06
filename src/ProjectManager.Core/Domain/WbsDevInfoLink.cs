namespace ProjectManager.Core.Domain;

// WbsItem ↔ DevInfoItem 다대다 조인 ("관련 정보"). 무방향·무타입 — 단순 연결 한 종류.
// (IssueWbsLink 와 달리 Type enum 없음. 추후 의미 구분이 필요하면 Type 컬럼 + 마이그레이션 추가.)
// IAuditable 이라 ActivityLogInterceptor 가 추가/삭제를 자동 캡처.
public class WbsDevInfoLink : IAuditable
{
    public int Id { get; set; }
    public int WbsItemId { get; set; }
    public int DevInfoItemId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;

    public WbsItem WbsItem { get; set; } = null!;
    public DevInfoItem DevInfoItem { get; set; } = null!;
}
