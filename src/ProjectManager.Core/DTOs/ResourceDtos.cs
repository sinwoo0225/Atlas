using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

public record ResourceDto(
    int Id, string Name, ResourceType Type,
    string Department, string Email, string Phone, string Notes,
    DateTime CreatedAt, DateTime UpdatedAt,
    double WeeklyCapacityHours, decimal? CostRate, decimal? BillRate,
    string Skills, bool IsActive);

public record CreateResourceDto(
    string Name, ResourceType Type,
    string Department, string Email, string Phone, string Notes,
    double WeeklyCapacityHours = 40, decimal? CostRate = null, decimal? BillRate = null,
    string Skills = "", bool IsActive = true);

public record UpdateResourceDto(
    string Name, ResourceType Type,
    string Department, string Email, string Phone, string Notes,
    double WeeklyCapacityHours = 40, decimal? CostRate = null, decimal? BillRate = null,
    string Skills = "", bool IsActive = true);

public record ResourceAssignmentDto(
    int WbsItemId, int ProjectId, string ProjectName,
    string WbsItemName, DateTime? StartDate, DateTime? EndDate,
    WbsStatus Status);

// '나' 신원 통일 — 설정의 내 이름으로 Person 리소스를 찾거나 생성.
public record ResolveResourceDto(string Name);

// 자원 비가용 구간(휴가·공휴일). Hours=null 이면 구간 영업일 전부, 값이 있으면 부분 차감.
public record ResourceAvailabilityDto(
    int Id, int ResourceId, DateTime StartDate, DateTime EndDate,
    AvailabilityType Type, double? Hours, string Note);

public record CreateResourceAvailabilityDto(
    int ResourceId, DateTime StartDate, DateTime EndDate,
    AvailabilityType Type, double? Hours, string Note);
