namespace ProjectManager.Core.Domain;

public enum ResourceType { Person, Equipment }

public class Resource : IAuditable
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public ResourceType Type { get; set; } = ResourceType.Person;
    public string Department { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    // 용량 계획 필드(사이클: 자원·용량 관리). 주당 가용 시간(기본 40h). CapacityService 의 용량 기준.
    public double WeeklyCapacityHours { get; set; } = 40;
    // 원가/청구 단가(시간당). 마진·예산 '표시'용 — 청구 워크플로는 범위 밖. null=미설정.
    public decimal? CostRate { get; set; }
    public decimal? BillRate { get; set; }
    // 스킬 태그(콤마 구분). DevInfo 태그 관례 — 부분일치 필터.
    public string Skills { get; set; } = string.Empty;
    // 비활성(퇴사·미가동) 자원은 용량/가동률 집계에서 제외. 기본 활성.
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;
}
