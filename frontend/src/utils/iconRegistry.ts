// 메뉴/엔티티 아이콘 커스터마이즈 레지스트리.
// 사용자가 슬롯별로 lucide 아이콘을 교체할 수 있다. 선택 가능한 아이콘은 아래
// 큐레이트 목록(ICON_MAP)으로 한정 — `import * as` 로 전체(~1500개)를 번들에 넣지
// 않고 명시 import 만 트리셰이킹되게 유지한다. 저장되는 오버라이드는 항상 이 목록 안.
import { createElement, type CSSProperties } from 'react';
import {
  type LucideIcon,
  FolderOpen, BarChart3, Activity, Users, User, LayoutDashboard, CalendarDays,
  NotebookPen, AlertTriangle, GitBranch, FileText, Code2, Network, Settings,
  // 추가 선택지
  Folder, FolderTree, Home, Compass, Map, MapPin, Target, Flag, Bookmark,
  ListChecks, ListTodo, ClipboardList, Clipboard, SquareCheck, CheckCircle2,
  Calendar, CalendarRange, CalendarClock, Clock, Timer, History,
  Bug, ShieldAlert, AlertCircle, Info, HelpCircle, Lightbulb, Zap,
  GitCommitHorizontal, GitMerge, GitPullRequest, GitFork, Boxes, Box, Package, Layers,
  FileCode2, FileSpreadsheet, Files, BookOpen, Book, StickyNote, PenLine,
  MessageSquare, MessagesSquare, Mail, Phone, Bell, Star, Heart,
  Database, Server, HardDrive, Cpu, Terminal, Braces, Binary,
  PieChart, LineChart, TrendingUp, Gauge, Kanban, Table2, Grid3x3,
  Users2, UserCog, Briefcase, Building2, Wrench, Hammer, Cog, Sparkles,
  Rocket, Trophy, Award, Pin, Tag, Tags, Hash, Link2,
} from 'lucide-react';
import { loadSettings } from '../store/settings';

// 슬롯키 → 기본 아이콘 이름 + i18n 라벨 키. (Layout 의 nav path / 프로젝트 메뉴 path / 'settings')
// 라벨은 nav 네임스페이스 재사용(설정 아이콘 피커에서 t(labelKey) 로 해석).
export const MENU_ICON_SLOTS: { slot: string; labelKey: string; default: string }[] = [
  { slot: '/', labelKey: 'nav:projects', default: 'FolderOpen' },
  { slot: '/todos', labelKey: 'nav:todos', default: 'ListTodo' },
  { slot: '/monitoring', labelKey: 'nav:monitoring', default: 'BarChart3' },
  { slot: '/retrospective', labelKey: 'nav:retrospective', default: 'History' },
  { slot: '/activity', labelKey: 'nav:activity', default: 'Activity' },
  { slot: '/resources', labelKey: 'nav:resources', default: 'Users' },
  { slot: '/wbs-templates', labelKey: 'nav:wbsTemplates', default: 'ClipboardList' },
  { slot: 'dashboard', labelKey: 'nav:dashboard', default: 'LayoutDashboard' },
  { slot: 'wbs', labelKey: 'nav:wbs', default: 'CalendarDays' },
  { slot: 'worklog', labelKey: 'nav:worklog', default: 'NotebookPen' },
  { slot: 'issues', labelKey: 'nav:issues', default: 'AlertTriangle' },
  { slot: 'changelogs', labelKey: 'nav:changelogs', default: 'GitBranch' },
  { slot: 'meetings', labelKey: 'nav:meetings', default: 'FileText' },
  { slot: 'devinfo', labelKey: 'nav:devinfo', default: 'Code2' },
  { slot: 'map', labelKey: 'nav:map', default: 'Network' },
  { slot: 'settings', labelKey: 'nav:settings', default: 'Settings' },
];

// 엔티티 타입 → 기본 아이콘 이름 + i18n 라벨 키. (활동 피드 / 커맨드 팔레트 공용)
// 라벨은 activity:entityType.* 재사용.
export const ENTITY_ICON_SLOTS: { slot: string; labelKey: string; default: string }[] = [
  { slot: 'Project', labelKey: 'activity:entityType.Project', default: 'FolderOpen' },
  { slot: 'WbsItem', labelKey: 'activity:entityType.WbsItem', default: 'CalendarDays' },
  { slot: 'Issue', labelKey: 'activity:entityType.Issue', default: 'AlertTriangle' },
  { slot: 'Meeting', labelKey: 'activity:entityType.Meeting', default: 'FileText' },
  { slot: 'ChangeLog', labelKey: 'activity:entityType.ChangeLog', default: 'GitBranch' },
  { slot: 'DevInfoItem', labelKey: 'activity:entityType.DevInfoItem', default: 'Code2' },
  { slot: 'WorkLog', labelKey: 'activity:entityType.WorkLog', default: 'NotebookPen' },
  { slot: 'Resource', labelKey: 'activity:entityType.Resource', default: 'User' },
];

// 이름 → 컴포넌트. 선택 피커가 노출하는 전체 후보이기도 하다.
const ICON_MAP: Record<string, LucideIcon> = {
  FolderOpen, BarChart3, Activity, Users, User, LayoutDashboard, CalendarDays,
  NotebookPen, AlertTriangle, GitBranch, FileText, Code2, Network, Settings,
  Folder, FolderTree, Home, Compass, Map, MapPin, Target, Flag, Bookmark,
  ListChecks, ListTodo, ClipboardList, Clipboard, SquareCheck, CheckCircle2,
  Calendar, CalendarRange, CalendarClock, Clock, Timer, History,
  Bug, ShieldAlert, AlertCircle, Info, HelpCircle, Lightbulb, Zap,
  GitCommitHorizontal, GitMerge, GitPullRequest, GitFork, Boxes, Box, Package, Layers,
  FileCode2, FileSpreadsheet, Files, BookOpen, Book, StickyNote, PenLine,
  MessageSquare, MessagesSquare, Mail, Phone, Bell, Star, Heart,
  Database, Server, HardDrive, Cpu, Terminal, Braces, Binary,
  PieChart, LineChart, TrendingUp, Gauge, Kanban, Table2, Grid3x3,
  Users2, UserCog, Briefcase, Building2, Wrench, Hammer, Cog, Sparkles,
  Rocket, Trophy, Award, Pin, Tag, Tags, Hash, Link2,
};

// 피커에 노출할 선택 가능한 아이콘 이름 (정렬된 전체 목록).
export const SELECTABLE_ICONS: string[] = Object.keys(ICON_MAP).sort((a, b) => a.localeCompare(b));

const FALLBACK: LucideIcon = HelpCircle;

/** 이름으로 아이콘 컴포넌트 조회. 미등록 이름은 폴백. */
export function resolveIcon(name: string | undefined): LucideIcon {
  if (!name) return FALLBACK;
  return ICON_MAP[name] ?? FALLBACK;
}

// 오버라이드 캐시 — 설정 변경 이벤트로 갱신. (렌더마다 localStorage 파싱 회피)
let menuOverrides: Record<string, string> = {};
let entityOverrides: Record<string, string> = {};

function refreshOverrides() {
  const s = loadSettings();
  menuOverrides = s.menuIcons;
  entityOverrides = s.entityIcons;
}
if (typeof window !== 'undefined') {
  refreshOverrides();
  window.addEventListener('atlas:settings-changed', refreshOverrides);
}

const menuDefault = (slot: string) =>
  MENU_ICON_SLOTS.find((m) => m.slot === slot)?.default ?? 'FolderOpen';
const entityDefault = (slot: string) =>
  ENTITY_ICON_SLOTS.find((e) => e.slot === slot)?.default ?? 'FileText';

/** 메뉴 슬롯 아이콘 — overrides 미지정 시 캐시 사용. */
export function getMenuIcon(slot: string, overrides?: Record<string, string>): LucideIcon {
  const map = overrides ?? menuOverrides;
  return resolveIcon(map[slot] || menuDefault(slot));
}

/** 엔티티 타입 아이콘 — overrides 미지정 시 캐시 사용. */
export function getEntityIcon(slot: string, overrides?: Record<string, string>): LucideIcon {
  const map = overrides ?? entityOverrides;
  return resolveIcon(map[slot] || entityDefault(slot));
}

// 렌더 컴포넌트 래퍼 — getMenuIcon/getEntityIcon/resolveIcon 은 호출식이라 JSX 에 직접
// 대입하면 react-hooks/static-components 규칙에 걸린다. 모듈 스코프의 정적 컴포넌트로
// 감싸 createElement 로 렌더한다.
interface IconElProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function MenuIcon({ slot, overrides, ...rest }: { slot: string; overrides?: Record<string, string> } & IconElProps) {
  return createElement(getMenuIcon(slot, overrides), rest);
}

export function EntityIcon({ slot, overrides, ...rest }: { slot: string; overrides?: Record<string, string> } & IconElProps) {
  return createElement(getEntityIcon(slot, overrides), rest);
}

export function NamedIcon({ name, ...rest }: { name: string } & IconElProps) {
  return createElement(resolveIcon(name), rest);
}
