namespace ProjectManager.Core.Domain;

public enum ActivityAction { Create, Update, Delete }

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
}
