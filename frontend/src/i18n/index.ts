import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { loadSettings } from '../store/settings';

import koCommon from './locales/ko/common.json';
import koNav from './locales/ko/nav.json';
import koStatus from './locales/ko/status.json';
import koSettings from './locales/ko/settings.json';
import koPalette from './locales/ko/palette.json';
import koShortcuts from './locales/ko/shortcuts.json';
import koDashboard from './locales/ko/dashboard.json';
import koProjects from './locales/ko/projects.json';
import koIssues from './locales/ko/issues.json';
import koWorklog from './locales/ko/worklog.json';
import koResources from './locales/ko/resources.json';
import koActivity from './locales/ko/activity.json';
import koDevinfo from './locales/ko/devinfo.json';
import koChangelog from './locales/ko/changelog.json';
import koWidget from './locales/ko/widget.json';
import koMeetings from './locales/ko/meetings.json';
import koMonitoring from './locales/ko/monitoring.json';
import koWbs from './locales/ko/wbs.json';
import koMap from './locales/ko/map.json';
import enCommon from './locales/en/common.json';
import enNav from './locales/en/nav.json';
import enStatus from './locales/en/status.json';
import enSettings from './locales/en/settings.json';
import enPalette from './locales/en/palette.json';
import enShortcuts from './locales/en/shortcuts.json';
import enDashboard from './locales/en/dashboard.json';
import enProjects from './locales/en/projects.json';
import enIssues from './locales/en/issues.json';
import enWorklog from './locales/en/worklog.json';
import enResources from './locales/en/resources.json';
import enActivity from './locales/en/activity.json';
import enDevinfo from './locales/en/devinfo.json';
import enChangelog from './locales/en/changelog.json';
import enWidget from './locales/en/widget.json';
import enMeetings from './locales/en/meetings.json';
import enMonitoring from './locales/en/monitoring.json';
import enWbs from './locales/en/wbs.json';
import enMap from './locales/en/map.json';

export const SUPPORTED_LANGUAGES = ['ko', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

// 리소스는 번들에 인라인 — 백엔드 로딩 없이 동기 초기화되므로 Provider/Suspense 불필요.
// 기본 인스턴스라 컴포넌트는 useTranslation() 만으로 사용한다.
const resources = {
  ko: { common: koCommon, nav: koNav, status: koStatus, settings: koSettings, palette: koPalette, shortcuts: koShortcuts, dashboard: koDashboard, projects: koProjects, issues: koIssues, worklog: koWorklog, resources: koResources, activity: koActivity, devinfo: koDevinfo, changelog: koChangelog, widget: koWidget, meetings: koMeetings, monitoring: koMonitoring, wbs: koWbs, map: koMap },
  en: { common: enCommon, nav: enNav, status: enStatus, settings: enSettings, palette: enPalette, shortcuts: enShortcuts, dashboard: enDashboard, projects: enProjects, issues: enIssues, worklog: enWorklog, resources: enResources, activity: enActivity, devinfo: enDevinfo, changelog: enChangelog, widget: enWidget, meetings: enMeetings, monitoring: enMonitoring, wbs: enWbs, map: enMap },
} as const;

i18n.use(initReactI18next).init({
  resources,
  lng: loadSettings().language,
  fallbackLng: 'ko',
  defaultNS: 'common',
  ns: ['common', 'nav', 'status', 'settings', 'palette', 'shortcuts', 'dashboard', 'projects', 'issues', 'worklog', 'resources', 'activity', 'devinfo', 'changelog', 'widget', 'meetings', 'monitoring', 'wbs', 'map'],
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export default i18n;
