namespace ProjectManager.Core.Domain;

// Waiting(대기) 는 표시 순서상 Planned 와 InProgress 사이지만, DB 는 int ordinal 저장이라
// 기존 값(Planned=0/InProgress=1/Done=2)을 보존하려 enum 끝에 append(Waiting=3). 표시 순서는 프론트 배열로 제어.
// Suspended(중단=4)도 같은 이유로 끝에 append. 중단은 '종료(비완료)' 상태 — 완료도 잔여도 아니게 지표에서 제외(모니터링 참고).
public enum WbsStatus { Planned, InProgress, Done, Waiting, Suspended }

// 항목의 '역할' 선언. 구조(자식 유무)와는 별개 축이다 — 자식이 있는 Task(=상위 작업)도, 자식이 없는 Group(=빈 그룹)도 성립한다.
// Group = 순수 그루핑/스캐폴딩. 모든 지표·목록·알림·용량·번업·CFD 에서 제외되고, 표시값(상태·진행률·기간)은 자손 Task 에서 파생한다.
//         자기 Status/Assignee/EstimateHours 는 보존하되 무시.
// Task  = 1급 작업. 자식이 있어도 자기 자신이 1건으로 집계된다.
// 도입 전에는 이 역할을 트리 모양에서 추론했다(자식이 있으면 그루핑 노드) — 그래서 리프에 자식을 붙이는 순간
// 그 작업이 모든 지표에서 조용히 사라졌다. 추론을 선언으로 바꾼 것이 이 enum 이다.
// 저장은 string — 신규 enum 관례(WbsDependency.Type·Meeting.Category·TodoItem.Status). WbsStatus 만 레거시 int ordinal.
public enum WbsKind { Task, Group }

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
    public WbsKind Kind { get; set; } = WbsKind.Task;
    // Group 과는 배타 — 그룹은 자손에서 파생 표시라 마일스톤이 될 수 없다. 쓰기 시 WbsService 가 정규화(Group ⇒ false).
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
