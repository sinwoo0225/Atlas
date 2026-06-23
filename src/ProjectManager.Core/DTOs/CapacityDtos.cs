namespace ProjectManager.Core.DTOs;

// 자원 × 주 용량 셀. 수요(배정 작업 공수 영업일 분배) vs 용량(주당 가용 − 휴가).
public record CapacityCellDto(
    string WeekStart,
    double DemandHours,
    double CapacityHours,
    double UtilizationPercent,
    bool Overallocated);

// 한 자원의 주별 용량 행 + 요약.
public record ResourceCapacityRowDto(
    int ResourceId, string Name, string Department, string Skills,
    double WeeklyCapacityHours,
    IReadOnlyList<CapacityCellDto> Weeks,
    double TotalDemandHours,
    double AvgUtilizationPercent,
    int OverallocatedWeeks);

// 용량 히트맵 — 전 자원 × 주. UnscheduledDemandHours = 추정은 있으나 일정 없는 수요(주 배치 불가),
// UnestimatedTaskCount = 배정됐으나 공수 미추정 작업 수(수요 0 기여). 둘 다 조용히 버리지 않고 노출.
public record CapacityHeatmapDto(
    IReadOnlyList<string> WeekStarts,
    IReadOnlyList<ResourceCapacityRowDto> Rows,
    double UnscheduledDemandHours,
    int UnestimatedTaskCount);

// 교차 프로젝트 가동률 리포트 행(Phase 3). 기간 평균 가동률·과배분 주수.
public record UtilizationReportRowDto(
    int ResourceId, string Name, string Department, string Skills,
    bool IsActive,
    double TotalDemandHours, double TotalCapacityHours,
    double AvgUtilizationPercent, int OverallocatedWeeks);

public record UtilizationReportDto(
    string FromWeek, string ToWeek, int Weeks,
    IReadOnlyList<UtilizationReportRowDto> Rows);
