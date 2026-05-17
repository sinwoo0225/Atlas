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
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public WbsStatus Status { get; set; } = WbsStatus.Planned;
    public bool IsMilestone { get; set; }
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
