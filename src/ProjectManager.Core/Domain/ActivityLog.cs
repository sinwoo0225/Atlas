namespace ProjectManager.Core.Domain;

// Promote: 회의록 ActionItem 이 Issue/WbsItem 으로 승격된 경우. 자연 생성과 구분.
// 구현은 PromotionService 에서 자동 생성된 Create 행을 사후에 Promote 로 재기록 (interceptor 수정 회피).
public enum ActivityAction { Create, Update, Delete, Promote }

// 모든 IAuditable 엔티티의 Create/Update/Delete 를 SaveChangesInterceptor 가 자동 기록.
// Dashboard 의 "최근 활동" 피드와 향후 운영자 어드민 뷰의 데이터 소스.
// ProjectId 는 nullable — Resource 처럼 프로젝트에 안 묶인 엔티티도 있음.
// Project 삭제 시 cascade 하지 않음 — orphan ActivityLog 는 감사 로그로 그대로 보존.
public class ActivityLog
{
    public int Id { get; set; }
    public int? ProjectId { get; set; }
    public string EntityType { get; set; } = string.Empty;
    public int EntityId { get; set; }
    public string EntityTitle { get; set; } = string.Empty;
    public ActivityAction Action { get; set; }
    public string Actor { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    // Update 시점의 변경 필드 diff. JSON-in-TEXT (Meeting.Attendees 와 같은 패턴).
    // 형식: { "필드명": { "old": "...", "new": "..." }, ... }. Create/Delete 는 null.
    // 마이그레이션 이전에 만들어진 행은 null 로 자연 호환.
    public string? ChangesJson { get; set; }
}
