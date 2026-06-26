namespace ProjectManager.Core.Domain;

public enum WbsStatus { Planned, InProgress, Done }

public class WbsItem : IAuditable
{
    public int Id { get; set; }
    public int ProjectId { get; set; }
    public int? VersionId { get; set; }
    public int? ParentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Assignee { get; set; } = string.Empty;
    // StartDate/EndDate 는 '계획' 일자. 실적(실제 착수/완료)은 ActualStartDate/CompletedDate 로 별도 기록.
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    // 착수 일자(실적). Status 가 InProgress/Done 으로 처음 전환될 때 자동 스탬프(DateTime.Today), 사용자가 직접 수정 가능
    // (착수가 늦게 기록된 경우 실제 착수일로 보정). Planned 로 되돌리면 클리어. 계획 시작(StartDate) 대비 착수 지연 측정의 기준.
    public DateTime? ActualStartDate { get; set; }
    // 완료 일자(실적). Status 가 Done 으로 전환될 때 자동 스탬프(DateTime.Today), 사용자가 직접 수정 가능
    // (완료 처리가 늦어진 경우 실제 완료일로 보정). Done 에서 벗어나면 클리어. 계획 종료(EndDate) 대비 지연 측정의 기준.
    public DateTime? CompletedDate { get; set; }
    public WbsStatus Status { get; set; } = WbsStatus.Planned;
    public bool IsMilestone { get; set; }
    // 공수 추정(시간). 용량 계획(CapacityService)의 수요 기준 — leaf 에만 입력, 부모는 자손 leaf 합으로 계산(저장 안 함).
    // null=미추정(수요 0 기여하되 '미추정'으로 별도 집계). 사이클: 자원·용량 관리.
    public double? EstimateHours { get; set; }
    // 기준선(baseline) 일정 — '기준선 캡처' 시 당시 StartDate/EndDate 를 복사. Gantt 고스트 막대·variance 의 비교 기준.
    // null=기준선 없음. 시점 스냅샷이 아니라 작업 단위로 현재 계획을 박제(버전 매칭 불필요). 사이클: 일정 지능.
    public DateTime? BaselineStart { get; set; }
    public DateTime? BaselineEnd { get; set; }
    // 사이클 14 — Order 분리. Importance = 중요도 (1=낮음/2=중간/3=높음, 기본 2).
    // SortOrder = 정렬 위치 (단일 키, asc, 신규 생성 시만 자동 부여, 그 후엔 사용자 reorder 만).
    public int Importance { get; set; } = 2;
    public int SortOrder { get; set; }
    public string Notes { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;

    public Project Project { get; set; } = null!;
    public WbsVersion? Version { get; set; }
    public WbsItem? Parent { get; set; }
    public ICollection<WbsItem> Children { get; set; } = new List<WbsItem>();
    public ICollection<WbsAssignment> Assignments { get; set; } = new List<WbsAssignment>();
    // 경량 체크리스트(서브태스크). 중첩 WBS 작업(Children)과 별개로 한 작업 안의 세부 단계 진행을 추적.
    public ICollection<WbsSubtask> Subtasks { get; set; } = new List<WbsSubtask>();
}

public class WbsVersion
{
    public int Id { get; set; }
    public int ProjectId { get; set; }
    public string VersionName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsCurrent { get; set; }

    public Project Project { get; set; } = null!;
    public ICollection<WbsItem> WbsItems { get; set; } = new List<WbsItem>();
}
