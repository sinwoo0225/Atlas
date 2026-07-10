export type WbsStatus = 'Planned' | 'Waiting' | 'InProgress' | 'Done' | 'Suspended';
export type ImpactLevel = 'Low' | 'Medium' | 'High' | 'Critical';
export type DevInfoType = 'Markdown' | 'File' | 'Link' | 'GitRepo';
// Planned 는 '대기/보류'(Waiting)로 통합 — 기존 데이터 호환 위해 타입엔 남기되 UI 옵션에선 미노출.
export type ProjectStatus = 'Planned' | 'Waiting' | 'InProgress' | 'Done' | 'Maintenance';
// 프로젝트 구분 기본값(시드). Project.category 는 자유 문자열(string)이라 사용자가 임의 값을 등록 가능 —
// 아래 상수는 폼 자동완성의 초기 후보로만 쓰인다(고정 enum 아님).
export type ProjectCategory = '과제' | '내부' | '사업';
export const DEFAULT_PROJECT_CATEGORIES: ProjectCategory[] = ['과제', '내부', '사업'];
export type TodoStatus = 'Open' | 'Done';
export type TodoRecurrence = 'None' | 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';

export interface Project {
  id: number;
  name: string;
  category: string;
  description: string;
  goal: string;
  status: ProjectStatus;
  startDate?: string;
  endDate?: string;
  budget?: number;
  participants: string;
  deliverables: string;
  relatedLinks: string;
  folderPath: string;
  gitRepoPath: string;
  createdAt: string;
  updatedAt: string;
  completedDate?: string; // 실적 완료일 (Done 전환 시 자동, 수정 가능)
}

export interface ProjectDashboard {
  project: Project;
  upcomingMilestones: WbsItem[];
  recentChanges: ChangeLog[];
  recentMeetings: Meeting[];
  recentDevInfo: DevInfoItem[];
  recentIssues: Issue[];
  thisWeekWorkLog: WeeklyWorkLogProject | null;
  riskSignals: RiskSignals;
}

export interface RiskSignals {
  overdueWbs: WbsItem[];
  dueSoonWbs: WbsItem[];
  highPriorityOpenIssues: Issue[];
}

// 백업 zip 가져오기 — 미리보기 항목과 결과 요약.
export interface ImportPreviewItem {
  id: number;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  issueCount: number;
  wbsCount: number;
  meetingCount: number;
}

export interface ImportProjectResult {
  newProjectId: number;
  newProjectName: string;
  newFolderPath: string;
  issuesImported: number;
  issuesAssigneeMatched: number;
  issuesAssigneeMissing: number;
  wbsItemsImported: number;
  wbsVersionsImported: number;
  meetingsImported: number;
  devInfoItemsImported: number;
  workLogsImported: number;
  changeLogsImported: number;
  issueWbsLinksImported: number;
  warnings: string[];
}

// 시작 화면 위젯(E-2). across-project myOpenItems + dueSoonItems.
export interface StartPageData {
  myOpenItems: StartPageItem[];
  dueSoonItems: StartPageItem[];
}

export interface StartPageItem {
  kind: 'issue' | 'wbs';
  id: number;
  projectId: number;
  projectName: string;
  title: string;
  status: string;
  priority: string | null;
  dueDate: string | null;
}

export interface WbsItem {
  id: number;
  projectId: number;
  versionId?: number;
  parentId?: number;
  name: string;
  assignee: string;
  startDate?: string;
  endDate?: string;
  status: WbsStatus;
  isMilestone: boolean;
  // 사이클 14 — order 분리: importance = 중요도 (1/2/3), sortOrder = 정렬 위치 (단일 키, asc).
  importance: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  sortOrder: number;
  actualStartDate?: string; // 실적 착수일 (StartDate 는 계획). 진행/완료 전환 시 자동, 수정 가능.
  completedDate?: string; // 실적 완료일 (StartDate/EndDate 는 계획). Done 전환 시 자동, 수정 가능.
  // 공수 추정(시간) — 용량 계획 기준. rolledUpEstimateHours 는 부모 표시용 자손 leaf 합(읽기 전용).
  estimateHours?: number | null;
  rolledUpEstimateHours?: number | null;
  // 기준선 일정(캡처된 계획) — Gantt 고스트 막대·variance 기준.
  baselineStart?: string | null;
  baselineEnd?: string | null;
  // 경량 체크리스트(서브태스크) 진행률 — 목록 배지·간트 %. subtaskTotal>0 일 때만 표시. subtasks 는 상세(GetById)에서만.
  subtaskTotal?: number;
  subtaskDone?: number;
  subtasks?: WbsSubtask[];
  children?: WbsItem[];
}

// WbsItem 의 경량 체크리스트 항목. 중첩 WBS 작업(children)과 별개로 한 작업 안의 세부 단계.
export interface WbsSubtask {
  id: number;
  wbsItemId: number;
  title: string;
  isDone: boolean;
  sortOrder: number;
}

export interface WbsVersion {
  id: number;
  projectId: number;
  versionName: string;
  description: string;
  createdAt: string;
  isCurrent: boolean;
}

// WBS/일정 템플릿 — 새 프로젝트의 WBS 초기 세팅 재사용.
// 날짜는 절대값이 아니라 앵커(프로젝트 시작일) 기준 상대 오프셋. 빌트인은 보통 offset/duration 이 null(구조만).
export interface WbsTemplateNode {
  name: string;
  assignee: string;
  offsetStartDays?: number | null;
  durationDays?: number | null;
  isMilestone: boolean;
  importance: number;
  notes: string;
  children: WbsTemplateNode[];
}

// 목록용 — 노드 트리 제외. isBuiltIn 이면 id 는 null, builtinKey 로 식별.
export interface WbsTemplateSummary {
  id: number | null;
  builtinKey: string | null;
  isBuiltIn: boolean;
  name: string;
  description: string;
  category: string;
  nodeCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface WbsTemplate {
  id: number | null;
  builtinKey: string | null;
  isBuiltIn: boolean;
  name: string;
  description: string;
  category: string;
  nodes: WbsTemplateNode[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ChangeLog {
  id: number;
  projectId: number;
  date: string;
  content: string;
  impact: ImpactLevel;
  relatedDocLinks: string;
  sourceIssueId?: number | null;
  sourceIssueTitle?: string | null;
  sourceWbsItemId?: number | null;
  sourceWbsItemName?: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  isFavorite?: boolean;
}

export type MeetingCategory = 'Internal' | 'External';

export interface Meeting {
  id: number;
  projectId: number;
  date: string;
  startTime?: string;
  endTime?: string;
  category: MeetingCategory;
  attendees: string;
  topic: string;
  decisions: string;
  discussion: string;
  actionItems: string;
  markdownPath?: string | null;
  createdAt: string;
  updatedAt: string;
  isFavorite?: boolean;
}

export type DevInfoStorageMode = 'Copy' | 'Reference';

export interface DevInfoItem {
  id: number;
  projectId: number;
  title: string;
  type: DevInfoType;
  storageMode: DevInfoStorageMode;
  content: string;
  filePath: string;
  url: string;
  tags: string;
  createdAt: string;
  updatedAt: string;
  isFavorite?: boolean;
}

export type ResourceType = 'Person' | 'Equipment';

export interface Resource {
  id: number;
  name: string;
  type: ResourceType;
  department: string;
  email: string;
  phone: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  // 용량 계획 필드.
  weeklyCapacityHours: number;
  costRate: number | null;
  billRate: number | null;
  skills: string;
  isActive: boolean;
}

export interface ResourceAssignment {
  wbsItemId: number;
  projectId: number;
  projectName: string;
  wbsItemName: string;
  startDate?: string;
  endDate?: string;
  status: WbsStatus;
}

export type IssueStatus = 'Open' | 'InProgress' | 'Resolved' | 'Closed';
export type IssuePriority = 'Low' | 'Medium' | 'High';

export interface Issue {
  id: number;
  projectId: number;
  // 프로젝트별 1-기반 표시용 번호(전역 id 와 별개). 백엔드에서 부여, 표시 전용.
  sequenceNumber?: number;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeResourceId?: number | null;
  assigneeName?: string | null;
  dueDate?: string;
  occurredOn?: string;
  resolvedDate?: string; // 실적 해결일 (Resolved/Closed 전환 시 자동, 수정 가능)
  category?: string; // 분류 (단일 자유 입력값). 자동완성 후보는 로드된 issues 에서 파생.
  // 사용자 정의 커스텀 컬럼 값 맵. 와이어(customFieldsJson 문자열)는 issuesApi 경계에서 파싱/직렬화.
  customFields?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  isFavorite?: boolean;
}

// 이슈 리스트 사용자 정의 커스텀 컬럼 정의 (Project.IssueCustomColumnsJson 에 배열로 저장).
export type IssueCustomColumnType = 'text' | 'date' | 'number';
export interface IssueCustomColumn {
  key: string; // 안정 slug — 표시명(name)과 무관. 이름 변경해도 값 유지.
  name: string;
  type: IssueCustomColumnType;
  order: number;
}

// 독립 TODO — 어느 프로젝트에도 속하지 않는 개인 할 일. 반복 설정 시 완료하면 다음 회차 자동 생성.
export interface TodoItem {
  id: number;
  title: string;
  notes: string;
  assigneeResourceId?: number | null;
  assigneeName?: string | null;
  dueDate?: string;
  status: TodoStatus;
  completedDate?: string;
  recurrence: TodoRecurrence;
  recurrenceInterval: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// 통합 '내 업무' 한 줄 — WBS/이슈/독립 TODO 를 한 리스트로 합친 결과.
export interface MyWorkItem {
  sourceType: 'wbs' | 'issue' | 'todo';
  id: number;
  projectId?: number | null;
  projectName?: string | null;
  title: string;
  status: string;
  priority?: string | null;
  importance?: number | null;
  dueDate?: string | null;
  completedDate?: string | null;
  recurrence?: string | null;
}

// 프로젝트 회고 — 완료 프로젝트 비교 분석.
export interface SCurvePoint {
  elapsedPct: number;
  donePct: number;
}

export interface ProjectRetrospective {
  projectId: number;
  projectName: string;
  status: ProjectStatus;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  actualCompletion?: string | null;
  scheduleDelayDays?: number | null;
  scheduleDelayRatio?: number | null;
  wbsTotal: number;
  wbsDone: number;
  wbsLatePastPlannedEnd: number;
  wbsLateRatio: number;
  avgStartVarianceDays?: number | null;
  onTimeStartRatio?: number | null;
  avgCycleTimeDays?: number | null;
  startedCount: number;
  issuesTotal: number;
  issuesHigh: number;
  issuesMedium: number;
  issuesLow: number;
  issueDensity?: number | null;
  avgResolutionDays?: number | null;
  resolutionSampleCount: number;
  burnUp: SCurvePoint[];
}

export interface RetrospectiveData {
  projects: ProjectRetrospective[];
}

export interface TodayWbs {
  wbsItemId: number;
  projectId: number;
  projectName: string;
  wbsItemName: string;
  assignee: string;
  startDate?: string;
  endDate?: string;
  status: WbsStatus;
}

export interface MonitoringData {
  items: TodayWbs[];
}

export interface WorkLog {
  id: number;
  projectId: number;
  date: string; // ISO date
  done: string;
  plan: string;
  issues: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertWorkLog {
  done: string;
  plan: string;
  issues: string;
}

export interface WeeklyWorkLogDay {
  dayIndex: number;
  dayLabel: string;
  date: string;
  done: string;
  plan: string;
  issues: string;
}

export interface WeeklyWorkLogProject {
  projectId: number;
  projectName: string;
  days: WeeklyWorkLogDay[];
}

export interface WeeklyWorkLog {
  weekStart: string;
  projects: WeeklyWorkLogProject[];
}

export interface OpenIssue {
  id: number;
  title: string;
  description: string;
  assigneeName?: string | null;
}

export interface OpenIssuesByProject {
  projectId: number;
  projectName: string;
  issues: OpenIssue[];
}

// 주간 통합 '다음 주 계획' — 프로젝트별 다음 주 시작(StartDate) 예정 작업 + 다음 주 마감(EndDate/DueDate) 미해결 작업·이슈.
export interface NextWeekPlanItem {
  kind: 'wbs' | 'issue';
  id: number;
  title: string;
  assigneeName?: string | null;
  date: string; // yyyy-MM-dd (시작일 또는 마감일)
  reason: 'start' | 'due';
}

export interface NextWeekPlanByProject {
  projectId: number;
  projectName: string;
  items: NextWeekPlanItem[];
}

// 주간 회고 다이제스트 ('일지' 탭 상단) — 완료한 항목 / 놓친 마감 / 다음 주 마감 예정.
export interface ReviewCompletedItem {
  kind: 'wbs' | 'issue';
  id: number;
  projectId: number;
  projectName: string;
  title: string;
  completedAt: string;
  approximate: boolean;
}

export interface ReviewDeadlineItem {
  kind: 'wbs' | 'issue';
  id: number;
  projectId: number;
  projectName: string;
  title: string;
  assignee?: string | null;
  dueDate: string;
  priority?: string | null;
}

export interface WeeklyReview {
  weekStart: string;
  completed: ReviewCompletedItem[];
  missedDeadlines: ReviewDeadlineItem[];
  upcomingNextWeek: ReviewDeadlineItem[];
}

export interface ProjectStatusBreakdown {
  planned: number;
  waiting: number;
  inProgress: number;
  done: number;
  maintenance: number;
}

export interface IssueMatrixCell {
  status: IssueStatus;
  priority: IssuePriority;
  count: number;
}

export interface UpcomingMilestone {
  wbsItemId: number;
  projectId: number;
  projectName: string;
  name: string;
  endDate: string;
  status: WbsStatus;
}

export interface WbsProgress {
  projectId: number;
  projectName: string;
  projectStatus: ProjectStatus;
  total: number;
  done: number;
  progressPercent: number;
}

// 상태 분포 위젯의 우측 리스트 — 도넛 옆에 프로젝트별 진행률·마감 표시.
export interface ProjectStatusItem {
  projectId: number;
  projectName: string;
  status: ProjectStatus;
  progressPercent: number;
  endDate?: string;
}

export interface MonitoringCharts {
  projectStatus: ProjectStatusBreakdown;
  projects: ProjectStatusItem[];
  issueMatrix: IssueMatrixCell[];
  upcomingMilestones: UpcomingMilestone[];
  wbsProgress: WbsProgress[];
}

// '프로젝트별 활동량' 위젯 — 최근 N일 동안 활동 카운트, top K.
export interface ActivityByProject {
  projectId: number;
  projectName: string;
  count: number;
}

// D-1 리소스 히트맵: 담당자 × 8주 마감 밀도.
export interface ResourceHeatmapItem {
  weekIndex: number;
  kind: 'wbs' | 'issue';
  id: number;
  projectId: number;
  projectName: string;
  title: string;
  dueDate: string;
}

export interface ResourceHeatmapRow {
  assignee: string;
  counts: number[];
  items: ResourceHeatmapItem[];
}

export interface ResourceHeatmap {
  weekStarts: string[];
  rows: ResourceHeatmapRow[];
  totalItems: number;
  unassignedItems: number;
}

// 용량 히트맵 — 자원 × 주 수요/가용/가동률(시간 기반).
export interface CapacityCell {
  weekStart: string;
  demandHours: number;
  capacityHours: number;
  utilizationPercent: number;
  overallocated: boolean;
}

export interface ResourceCapacityRow {
  resourceId: number;
  name: string;
  department: string;
  skills: string;
  weeklyCapacityHours: number;
  weeks: CapacityCell[];
  totalDemandHours: number;
  avgUtilizationPercent: number;
  overallocatedWeeks: number;
}

export interface CapacityHeatmap {
  weekStarts: string[];
  rows: ResourceCapacityRow[];
  unscheduledDemandHours: number;
  unestimatedTaskCount: number;
}

// 카테고리별 포트폴리오 롤업.
export interface PortfolioRow {
  category: string;
  projectCount: number;
  wbsTotal: number;
  wbsDone: number;
  wbsProgressPercent: number;
  openIssues: number;
  demandHours: number;
  atRisk: number;
}
export interface PortfolioRollup {
  rows: PortfolioRow[];
}

// 주의(Attention) 피드 — 마감/과배분/미배정/마일스톤/정체 합성 알림.
export interface AttentionItem {
  kind: 'overdue' | 'overallocated' | 'lateStart' | 'dueSoon' | 'unassigned' | 'milestone' | 'stale';
  severity: 'high' | 'medium' | 'low';
  count: number;
  link: string;
}
export interface AttentionFeed {
  items: AttentionItem[];
  highCount: number;
}

// 일정 지능 — 작업 의존성·임계경로·자동 리스케줄.
export type WbsDependencyType = 'FinishToStart' | 'StartToStart' | 'FinishToFinish' | 'StartToFinish';

export interface WbsDependency {
  id: number;
  predecessorId: number;
  successorId: number;
  predecessorName?: string | null;
  successorName?: string | null;
  type: WbsDependencyType;
  lagDays: number;
}

export interface CriticalPathItem {
  wbsItemId: number;
  isCritical: boolean;
  totalFloatDays: number | null;
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  indeterminate: boolean;
}

export interface CriticalPath {
  projectStart: string | null;
  projectFinish: string | null;
  hasCycle: boolean;
  criticalPath: number[];
  items: CriticalPathItem[];
}

export interface RescheduleShift {
  wbsItemId: number;
  name: string;
  oldStart: string | null;
  oldEnd: string | null;
  newStart: string | null;
  newEnd: string | null;
  deltaDays: number;
}

export interface RescheduleResult {
  fromWbsItemId: number;
  skipWeekends: boolean;
  shifts: RescheduleShift[];
}

// 마감 캘린더 이벤트 — WBS 종료일 / 이슈 마감일. date 는 yyyy-MM-dd.
export interface CalendarEvent {
  kind: 'wbs' | 'issue';
  id: number;
  projectId: number;
  projectName: string;
  title: string;
  date: string;
  status: string; // WbsStatus | IssueStatus
  isMilestone: boolean;
  priority: string | null; // 이슈 전용(High/Medium/Low)
}

// 칸반 보드 항목 — WBS + 이슈. 컬럼은 status 로 매핑.
export type KanbanColumn = 'todo' | 'doing' | 'done';
export interface KanbanItem {
  kind: 'wbs' | 'issue';
  id: number;
  projectId: number;
  projectName: string;
  title: string;
  status: string; // WbsStatus | IssueStatus
  isMilestone: boolean;
  priority: string | null;
  assignee: string | null;
  dueDate: string | null; // yyyy-MM-dd
}

// ===== Phase 1 인사이트 (개요 위험·예외 + 담당자) =====

// Risk Radar(개요 상단 전역 위험 패널) 항목.
export interface RiskItem {
  kind: 'wbs' | 'issue';
  id: number;
  projectId: number;
  projectName: string;
  title: string;
  assignee: string | null;
  dueDate: string | null; // yyyy-MM-dd
  priority: string | null; // 이슈 전용
}

export interface MonitoringRisk {
  overdueWbs: RiskItem[];
  dueSoonWbs: RiskItem[];
  highOpenIssues: RiskItem[];
}

// 방치된 프로젝트 — 활성인데 lastActivity 가 daysSince 일 전. lastActivity 전무면 null.
export interface StaleProject {
  projectId: number;
  projectName: string;
  status: ProjectStatus;
  lastActivity: string | null; // yyyy-MM-dd
  daysSince: number;
}

// 담당자별 워크로드 + 위험 (관리자 렌즈).
export interface AssigneeWorkload {
  assignee: string;
  openWbs: number;
  openIssues: number;
  overdue: number;
  dueSoon: number;
  highOpen: number;
}

// 미할당 작업 큐 — 담당자 미지정 미완 항목.
export interface UnassignedItem {
  kind: 'wbs' | 'issue';
  id: number;
  projectId: number;
  projectName: string;
  title: string;
  dueDate: string | null;
}

export interface WorkloadOverview {
  assignees: AssigneeWorkload[];
  unassigned: UnassignedItem[];
}

// Aging WIP — 진행중 항목의 나이(일).
export interface AgingWipItem {
  kind: 'wbs' | 'issue';
  id: number;
  projectId: number;
  projectName: string;
  title: string;
  assignee: string | null;
  ageDays: number;
  createdAt: string; // yyyy-MM-dd
}

// 카테고리별 프로젝트 분포(개요 도넛).
export interface CategoryCount {
  category: string;
  count: number;
}

// ===== Phase 2 인사이트 (흐름·추세) =====
export interface ThroughputWeek { weekStart: string; wbs: number; issue: number; }
export interface IssueFlowWeek { weekStart: string; opened: number; resolved: number; }
export interface CycleTimePoint {
  kind: 'wbs' | 'issue';
  id: number;
  projectId: number;
  projectName: string;
  title: string;
  days: number;
  completedAt: string; // yyyy-MM-dd
  approximate: boolean; // 전이기록 없어 UpdatedAt 근사
}
export interface CycleTime {
  points: CycleTimePoint[];
  p50: number;
  p85: number;
  p95: number;
  approxCount: number;
}
export interface ActivityTrendDay { date: string; count: number; }
export interface AssigneeThroughputRow { assignee: string; counts: number[]; total: number; }
export interface AssigneeThroughput { weekStarts: string[]; rows: AssigneeThroughputRow[]; }
export interface AssigneeCycleTime { assignee: string; count: number; median: number; p85: number; }

// 추세 번들 — 추세/담당자 탭 지연 로드.
export interface MonitoringTrends {
  throughput: ThroughputWeek[];
  issueFlow: IssueFlowWeek[];
  cycleTime: CycleTime;
  activityTrend: ActivityTrendDay[];
  assigneeThroughput: AssigneeThroughput;
  assigneeCycleTime: AssigneeCycleTime[];
}

// ===== Phase 3 인사이트 (예측·고급 — 실험) =====
export interface CfdPoint { date: string; planned: number; inProgress: number; done: number; }
export interface MonteCarloBucket { weeks: number; count: number; }
export interface MonteCarlo {
  sufficient: boolean;
  remaining: number;
  histogram: MonteCarloBucket[];
  p50Weeks: number;
  p85Weeks: number;
  p50Date: string | null;
  p85Date: string | null;
}
export interface ProjectForecast {
  projectId: number;
  projectName: string;
  remaining: number;
  projectedWeeks: number | null;
  weeksToDeadline: number | null;
  atRisk: boolean;
}
export interface DepartmentRollup { department: string; openItems: number; people: number; }

// 예측 번들 — 추세 탭 '실험(Phase 3)' 섹션 지연 로드.
export interface ForecastBundle {
  cfd: CfdPoint[];
  monteCarlo: MonteCarlo;
  projectForecasts: ProjectForecast[];
  departmentRollup: DepartmentRollup[];
}

export type ActivityEntityType =
  | 'Project'
  | 'WbsItem'
  | 'ChangeLog'
  | 'Meeting'
  | 'DevInfoItem'
  | 'Resource'
  | 'Issue'
  | 'WorkLog';

export type ActivityAction = 'Create' | 'Update' | 'Delete' | 'Promote';

// IssueWbsLink 관계 타입 (C-2 사이클 5). 양방향에서 같은 라벨로 표시.
export type IssueWbsLinkType = 'RelatesTo' | 'Blocks' | 'ParentOf';

export interface ActivityChangeValue {
  old: string;
  new: string;
}

export interface ActivityLog {
  id: number;
  projectId: number | null;
  // 백엔드 LEFT JOIN 결과. projectId 가 null 이거나 프로젝트가 삭제된 orphan 인 경우 null.
  projectName: string | null;
  entityType: ActivityEntityType;
  entityId: number;
  entityTitle: string;
  action: ActivityAction;
  actor: string;
  timestamp: string;
  // Update 시점의 변경 필드 diff. Create/Delete 는 null.
  // 필드명 → { old, new } 매핑. 장문 텍스트는 첫 줄 80자 + "…" 로 truncated.
  changedFields?: Record<string, ActivityChangeValue> | null;
}
