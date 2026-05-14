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
  author: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface DevInfoItem {
  id: number;
  projectId: number;
  title: string;
  type: DevInfoType;
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
