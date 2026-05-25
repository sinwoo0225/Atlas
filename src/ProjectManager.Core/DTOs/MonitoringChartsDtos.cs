using ProjectManager.Core.Domain;

namespace ProjectManager.Core.DTOs;

// 통합 모니터링 페이지 상단의 종합 시각화에 쓰는 집계 DTO들.

public record ProjectStatusBreakdownDto(
    int Planned, int Waiting, int InProgress, int Done);

// 상태 분포 위젯의 우측 리스트 — 도넛 옆에 프로젝트별 진행률·마감 표시.
// progressPercent 는 WBS 진행률과 동일 계산 (마일스톤 제외, total 0 이면 0).
public record ProjectStatusItemDto(
    int ProjectId, string ProjectName, ProjectStatus Status,
    double ProgressPercent, DateTime? EndDate);

public record IssueMatrixCellDto(
    IssueStatus Status, IssuePriority Priority, int Count);

public record UpcomingMilestoneDto(
    int WbsItemId, int ProjectId, string ProjectName,
    string Name, DateTime EndDate, WbsStatus Status);

public record WbsProgressDto(
    int ProjectId, string ProjectName, ProjectStatus ProjectStatus,
    int Total, int Done, double ProgressPercent);

public record MonitoringChartsDto(
    ProjectStatusBreakdownDto ProjectStatus,
    IEnumerable<ProjectStatusItemDto> Projects,
    IEnumerable<IssueMatrixCellDto> IssueMatrix,
    IEnumerable<UpcomingMilestoneDto> UpcomingMilestones,
    IEnumerable<WbsProgressDto> WbsProgress);

// '프로젝트별 활동량' 위젯 — sinceDate 이후 활동 카운트, count DESC.
public record ActivityByProjectDto(
    int ProjectId, string ProjectName, int Count);

// D-1 리소스 히트맵: across-project 담당자 × 8주 마감 밀도.
// WeekStarts 길이 8 (월요일 시작 ISO), Rows[i].Counts 길이 8.
public record ResourceHeatmapDto(
    IReadOnlyList<string> WeekStarts,
    IReadOnlyList<ResourceHeatmapRow> Rows,
    int TotalItems,
    int UnassignedItems);

public record ResourceHeatmapRow(
    string Assignee,
    int[] Counts,
    IReadOnlyList<ResourceHeatmapItem> Items);

public record ResourceHeatmapItem(
    int WeekIndex,
    string Kind, // "wbs" | "issue"
    int Id,
    int ProjectId,
    string ProjectName,
    string Title,
    string DueDate);

// 마감 캘린더(통합 모니터링 '작업' 탭의 캘린더 뷰): across-project WBS 종료일 + 이슈 마감일 이벤트.
// Date 는 yyyy-MM-dd. IsMilestone 은 wbs 전용(issue 는 false), Priority 는 issue 전용(wbs 는 null).
public record CalendarEventDto(
    string Kind, // "wbs" | "issue"
    int Id,
    int ProjectId,
    string ProjectName,
    string Title,
    string Date,
    string Status,
    bool IsMilestone,
    string? Priority);

// 칸반 보드('작업' 탭 칸반 뷰): across-project WBS + 이슈. 컬럼(예정/진행/완료) 매핑은 프론트가 Status 로 수행.
// 완료(Done/Resolved/Closed)는 서비스에서 최근 N일만 포함. DueDate 는 yyyy-MM-dd(WBS EndDate / 이슈 DueDate).
public record KanbanItemDto(
    string Kind, // "wbs" | "issue"
    int Id,
    int ProjectId,
    string ProjectName,
    string Title,
    string Status,
    bool IsMilestone,
    string? Priority,
    string? Assignee,
    string? DueDate);

// ===== Phase 1 인사이트 (개요 위험·예외 + 담당자) =====

// Risk Radar(개요 상단 전역 위험 패널): 전 프로젝트의 마감 초과/임박 WBS + High Open 이슈.
// ProjectService.GetDashboardAsync 의 RiskSignals 를 across-project 로 확장한 것.
public record RiskItemDto(
    string Kind,        // "wbs" | "issue"
    int Id,
    int ProjectId,
    string ProjectName,
    string Title,
    string? Assignee,
    string? DueDate,    // yyyy-MM-dd (WBS EndDate / Issue DueDate)
    string? Priority);  // issue 전용 (wbs 는 null)

public record MonitoringRiskDto(
    IReadOnlyList<RiskItemDto> OverdueWbs,
    IReadOnlyList<RiskItemDto> DueSoonWbs,
    IReadOnlyList<RiskItemDto> HighOpenIssues);

// 방치된 프로젝트: 활성(InProgress/Waiting)인데 최근 활동이 days일 이상 없는 프로젝트.
// LastActivity 는 ActivityLog 의 마지막 Timestamp(yyyy-MM-dd). 활동 기록 전무면 null(생성일 기준 경과).
public record StaleProjectDto(
    int ProjectId, string ProjectName, ProjectStatus Status,
    string? LastActivity, int DaysSince);

// 담당자별 워크로드 + 위험(관리자 렌즈). 미완 WBS(Assignee split) + 미완 이슈(AssigneeResource)를
// 담당자명 대소문자 무시로 합산. 한 위젯이 워크로드 막대(OpenWbs/OpenIssues)와 위험 매트릭스(Overdue/DueSoon/HighOpen)를 모두 공급.
public record AssigneeWorkloadDto(
    string Assignee,
    int OpenWbs, int OpenIssues,
    int Overdue, int DueSoon, int HighOpen);

// 미할당 작업 큐(관리자 배정 액션 아이템): 담당자 미지정 미완 항목, 마감 임박순.
public record UnassignedItemDto(
    string Kind, int Id, int ProjectId, string ProjectName,
    string Title, string? DueDate);

public record WorkloadOverviewDto(
    IReadOnlyList<AssigneeWorkloadDto> Assignees,
    IReadOnlyList<UnassignedItemDto> Unassigned);

// Aging WIP: 진행중(WBS InProgress / 이슈 Open·InProgress) 항목의 나이(CreatedAt→오늘, UTC) 내림차순.
public record AgingWipItemDto(
    string Kind, int Id, int ProjectId, string ProjectName,
    string Title, string? Assignee, int AgeDays, string CreatedAt);

// 카테고리별 프로젝트 분포(개요 도넛). Category 자유 문자열, 공백은 "미분류"로 합산.
public record CategoryCountDto(string Category, int Count);

// ===== Phase 2 인사이트 (흐름·추세 — ActivityLog 상태전이 재구성) =====
// 완료 시점은 ActivityLog 의 Status→Done/Resolved/Closed 전이 Timestamp(UTC). 전이 기록이 없는 항목은
// 엔티티 UpdatedAt 으로 근사(Approximate 표기). 모든 주(Week)는 월요일 시작 ISO(yyyy-MM-dd).

// C-1 주간 처리량: 주별 완료 건수(WBS Done / Issue Resolved·Closed).
public record ThroughputWeekDto(string WeekStart, int Wbs, int Issue);

// C-2 이슈 순증감: 주별 신규 발생(Issue.CreatedAt) vs 해결(완료 전이). 프론트가 누적선 계산.
public record IssueFlowWeekDto(string WeekStart, int Opened, int Resolved);

// C-3 사이클타임: 완료 항목별 소요일(완료−생성) + 50/85/95 백분위. ApproxCount = UpdatedAt 근사 건수.
public record CycleTimePointDto(
    string Kind, int Id, int ProjectId, string ProjectName, string Title,
    double Days, string CompletedAt, bool Approximate);
public record CycleTimeDto(
    IReadOnlyList<CycleTimePointDto> Points, double P50, double P85, double P95, int ApproxCount);

// C-4 활동량 추세: 일별 ActivityLog 카운트(빈 날 0 채움).
public record ActivityTrendDayDto(string Date, int Count);

// B-3 담당자별 주간 처리량: WeekStarts 길이 N, Rows[i].Counts 길이 N.
public record AssigneeThroughputRow(string Assignee, int[] Counts, int Total);
public record AssigneeThroughputDto(IReadOnlyList<string> WeekStarts, IReadOnlyList<AssigneeThroughputRow> Rows);

// B-4 담당자별 사이클타임: 완료 표본 수 + 중앙값·85p(일).
public record AssigneeCycleTimeDto(string Assignee, int Count, double Median, double P85);

// 추세 번들 — 완료 전이 추출 1회로 C-1~C-4 + B-3·B-4 한 번에. 추세/담당자 탭 지연 로드.
public record MonitoringTrendsDto(
    IReadOnlyList<ThroughputWeekDto> Throughput,
    IReadOnlyList<IssueFlowWeekDto> IssueFlow,
    CycleTimeDto CycleTime,
    IReadOnlyList<ActivityTrendDayDto> ActivityTrend,
    AssigneeThroughputDto AssigneeThroughput,
    IReadOnlyList<AssigneeCycleTimeDto> AssigneeCycleTime);
