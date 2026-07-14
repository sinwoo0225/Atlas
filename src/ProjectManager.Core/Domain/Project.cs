namespace ProjectManager.Core.Domain;

// int 서수로 저장(EF 컨버전 없음). 순서를 바꾸면 기존 행이 어긋나므로 신규 값은 끝에만 추가.
// Planned(0) 는 '대기/보류'(Waiting)로 통합돼 UI 에서는 더 이상 노출하지 않음 — 기존 데이터 호환 위해 멤버는 유지.
public enum ProjectStatus { Planned, Waiting, InProgress, Done, Maintenance }

public class Project : IAuditable
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;   // 프로젝트 구분: 과제·내부·사업·유지보수/하자보수 (자유 문자열)
    public string Description { get; set; } = string.Empty;
    public string Goal { get; set; } = string.Empty;
    public ProjectStatus Status { get; set; } = ProjectStatus.Waiting;
    // StartDate/EndDate 는 '계획' 일자(목표 시작·완료). 실적은 CompletedDate.
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    // 완료 일자(실적). Status 가 Done 으로 전환될 때 자동 스탬프(DateTime.Today), 직접 수정 가능.
    // Done 에서 벗어나면 클리어. 프로젝트 회고의 계획 대비 지연 측정 기준.
    public DateTime? CompletedDate { get; set; }
    public decimal? Budget { get; set; }
    public string Participants { get; set; } = string.Empty;
    public string Deliverables { get; set; } = string.Empty;
    public string RelatedLinks { get; set; } = string.Empty;
    public string FolderPath { get; set; } = string.Empty;
    // 연결된 소스코드 저장소(.git)의 로컬 절대 경로. 비어 있으면 Git 이력 기능 미사용.
    // FolderPath(Atlas 데이터 폴더)와는 별개 — 사용자의 실제 코드 작업 폴더.
    public string GitRepoPath { get; set; } = string.Empty;
    // 이슈 리스트의 사용자 정의 커스텀 컬럼 정의. JSON-in-TEXT 배열
    // [{ "key":slug, "name":표시명, "type":"text|date|number", "order":n }]. 값은 Issue.CustomFieldsJson.
    public string IssueCustomColumnsJson { get; set; } = string.Empty;
    // 리프 작업에 첫 자식이 붙을 때 그 부모를 자동으로 Group 으로 승격할지. 기본 true = 도입 전 동작(부모=그루핑 노드) 보존.
    // WBS 를 '상위 작업' 중심으로 쓰는 프로젝트는 끄면 된다 — 그때는 부모가 Task 로 남아 지표에 계속 잡힌다.
    public bool AutoGroupParents { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;

    public ICollection<WbsItem> WbsItems { get; set; } = new List<WbsItem>();
    public ICollection<ChangeLog> ChangeLogs { get; set; } = new List<ChangeLog>();
    public ICollection<Meeting> Meetings { get; set; } = new List<Meeting>();
    public ICollection<DevInfoItem> DevInfoItems { get; set; } = new List<DevInfoItem>();
    public ICollection<WbsVersion> WbsVersions { get; set; } = new List<WbsVersion>();
}
