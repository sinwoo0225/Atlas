namespace ProjectManager.Core.Domain;

public enum IssueStatus { Open, InProgress, Resolved, Closed }
public enum IssuePriority { Low, Medium, High }

public class Issue : IAuditable
{
    public int Id { get; set; }
    public int ProjectId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public IssueStatus Status { get; set; } = IssueStatus.Open;
    public IssuePriority Priority { get; set; } = IssuePriority.Medium;
    public int? AssigneeResourceId { get; set; }
    public DateTime? DueDate { get; set; }
    // 발생일자 — 이슈가 실제로 발생한 시점. 등록일(CreatedAt = 시스템 입력 시각)과 별개로,
    // 과거에 일어난 일을 나중에 등록하는 경우를 위해 사용자가 직접 지정. 선택 필드.
    public DateTime? OccurredOn { get; set; }
    // 해결 일자(실적). Status 가 Resolved/Closed 로 전환될 때 자동 스탬프(DateTime.Today), 직접 수정 가능.
    // 완료 상태에서 벗어나면 클리어. 마감(DueDate) 대비 지연·해결 소요기간 측정의 기준.
    public DateTime? ResolvedDate { get; set; }
    // 분류 — 사용자가 자유 입력하는 단일 구분값(예: 버그·기능·문의). 빈 문자열 = 미분류.
    // 한 번 입력한 값은 UI 에서 자동완성 후보로 제시(IssueRepository.GetCategoriesByProjectAsync).
    public string Category { get; set; } = string.Empty;
    // 사용자 정의 커스텀 컬럼의 값. JSON-in-TEXT 평탄 맵 { "컬럼key": "문자열값" }.
    // 컬럼 정의(이름·유형·순서)는 Project.IssueCustomColumnsJson. 서버는 파싱하지 않고 passthrough.
    public string CustomFieldsJson { get; set; } = string.Empty;
    // 즐겨찾기(별표) — 목록 최상단 고정·'별표만 보기' 필터용. 프로젝트 단위 사용자 표식.
    public bool IsFavorite { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;

    public Project Project { get; set; } = null!;
    public Resource? AssigneeResource { get; set; }
}
