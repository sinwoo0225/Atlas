namespace ProjectManager.Core.Domain;

// WbsItem ↔ Resource 다대다 배정 + 배분율. 자유텍스트 WbsItem.Assignee(표시·레거시 집계용)와 병행 —
// 매 WBS 쓰기 시 WbsAssignmentService.ReconcileFromFreeTextAsync 가 동기화한다. 용량 계산(CapacityService)의 정본.
// AllocationPercent = 이 자원이 이 작업 공수(EstimateHours)에서 맡는 비율(%). 신규 행은 인원수 균등(100/N),
// 사용자가 명시 편집 가능(과배분 표현 위해 합계 100 초과 허용).
// IAuditable 이라 ActivityLogInterceptor 가 추가/삭제/배분 변경을 자동 캡처.
public class WbsAssignment : IAuditable
{
    public int Id { get; set; }
    public int WbsItemId { get; set; }
    public int ResourceId { get; set; }
    public int AllocationPercent { get; set; } = 100;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;

    public WbsItem WbsItem { get; set; } = null!;
    public Resource Resource { get; set; } = null!;
}
