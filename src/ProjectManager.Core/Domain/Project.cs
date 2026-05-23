namespace ProjectManager.Core.Domain;

public enum ProjectStatus { Planned, Waiting, InProgress, Done }

public class Project : IAuditable
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;   // 프로젝트 구분: 과제·내부·사업·유지보수/하자보수 (자유 문자열)
    public string Description { get; set; } = string.Empty;
    public string Goal { get; set; } = string.Empty;
    public ProjectStatus Status { get; set; } = ProjectStatus.Planned;
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public decimal? Budget { get; set; }
    public string Participants { get; set; } = string.Empty;
    public string Deliverables { get; set; } = string.Empty;
    public string RelatedLinks { get; set; } = string.Empty;
    public string FolderPath { get; set; } = string.Empty;
    // 연결된 소스코드 저장소(.git)의 로컬 절대 경로. 비어 있으면 Git 이력 기능 미사용.
    // FolderPath(Atlas 데이터 폴더)와는 별개 — 사용자의 실제 코드 작업 폴더.
    public string GitRepoPath { get; set; } = string.Empty;
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
