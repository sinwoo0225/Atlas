namespace ProjectManager.Core.Domain;

// 가용성 차감 사유. 문자열로 저장(enum 순서 변경 안전, SQL 가독성) — Meeting.Category 관례.
public enum AvailabilityType { PTO, Holiday, Other }

// 자원의 비가용 구간(휴가·공휴일 등). CapacityService 가 주별 용량에서 차감.
// Hours=null 이면 구간의 영업일 전부(일 = WeeklyCapacityHours/5)를 차감, 값이 있으면 그 시간만 차감(부분 휴가).
public class ResourceAvailability : IAuditable
{
    public int Id { get; set; }
    public int ResourceId { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public AvailabilityType Type { get; set; } = AvailabilityType.PTO;
    public double? Hours { get; set; }
    public string Note { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;

    public Resource Resource { get; set; } = null!;
}
