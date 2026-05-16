export type WbsStatus = 'Planned' | 'InProgress' | 'Done';
export type ImpactLevel = 'Low' | 'Medium' | 'High' | 'Critical';
export type DevInfoType = 'Markdown' | 'File' | 'Link';
export type ProjectStatus = 'Planned' | 'Waiting' | 'InProgress' | 'Done';

export interface Project {
  id: number;
  name: string;
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
  createdAt: string;
  updatedAt: string;
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
  order: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  children?: WbsItem[];
}

export interface WbsVersion {
  id: number;
  projectId: number;
  versionName: string;
  description: string;
  createdAt: string;
  isCurrent: boolean;
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
}

export interface Meeting {
  id: number;
  projectId: number;
  date: string;
  startTime?: string;
  endTime?: string;
  attendees: string;
  topic: string;
  decisions: string;
  discussion: string;
  actionItems: string;
  markdownPath?: string | null;
  createdAt: string;
  updatedAt: string;
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
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeResourceId?: number | null;
  assigneeName?: string | null;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
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

export interface ProjectStatusBreakdown {
  planned: number;
  waiting: number;
  inProgress: number;
  done: number;
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

export interface MonitoringCharts {
  projectStatus: ProjectStatusBreakdown;
  issueMatrix: IssueMatrixCell[];
  upcomingMilestones: UpcomingMilestone[];
  wbsProgress: WbsProgress[];
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

export type ActivityAction = 'Create' | 'Update' | 'Delete';

export interface ActivityChangeValue {
  old: string;
  new: string;
}

export interface ActivityLog {
  id: number;
  projectId: number | null;
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
