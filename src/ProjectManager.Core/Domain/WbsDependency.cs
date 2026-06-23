namespace ProjectManager.Core.Domain;

// 의존성 타입(선행→후행 관계). 문자열로 저장 — IssueWbsLink.Type 관례. 기본 FinishToStart(가장 흔함).
// FS: 선행 종료 후 후행 시작 / SS: 동시 시작 / FF: 동시 종료 / SF: 선행 시작 후 후행 종료.
public enum WbsDependencyType { FinishToStart, StartToStart, FinishToFinish, StartToFinish }

// WbsItem(선행) → WbsItem(후행) 의존성. SchedulingService 의 CPM·자동 리스케줄이 사용.
// ProjectId 는 저장하지 않고 양 끝점에서 유도(서비스가 동일 프로젝트 가드 + 사이클 가드).
// IAuditable 이라 ActivityLogInterceptor 가 추가/삭제/타입·lag 변경을 자동 캡처.
public class WbsDependency : IAuditable
{
    public int Id { get; set; }
    public int PredecessorId { get; set; }
    public int SuccessorId { get; set; }
    public WbsDependencyType Type { get; set; } = WbsDependencyType.FinishToStart;
    // 지연(영업일). 양수=간격, 음수=중첩(lead). FS+lag2 = 선행 종료 2영업일 후 후행 시작.
    public int LagDays { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;

    public WbsItem Predecessor { get; set; } = null!;
    public WbsItem Successor { get; set; } = null!;
}
