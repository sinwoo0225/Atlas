// Captures Microsoft Store / README screenshots of the Atlas UI with Playwright.
//
// Run via the orchestrator `capture-screenshots.ps1` (it starts the backend + Vite,
// seeds an isolated sample DB, then calls this). Standalone usage:
//   node scripts/capture-screenshots.mjs --lang ko --base http://localhost:5173 --out ../screenshots
//
// Language is forced by seeding the `pm-hub-settings` localStorage key before the app
// loads (loadSettings() merges it over defaults). No rebuild needed to switch languages.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join, isAbsolute, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};

const lang = arg('lang', 'ko');
const base = arg('base', 'http://localhost:5173').replace(/\/$/, '');
const outArg = arg('out', 'screenshots');
const out = isAbsolute(outArg) ? outArg : resolve(process.cwd(), outArg);

// Seeded sample DB → project #1 is "Atlas v1.5 릴리즈". Viewport ≥ Store min (1366×768).
const VIEWPORT = { width: 1920, height: 1080 };
// path = sidebar link href to click (SPA nav). gantt:true → also click the Gantt view toggle.
const SHOTS = [
  { name: 'projects',    path: '/' },
  { name: 'dashboard',   path: '/projects/1/dashboard', wait: 2500 },
  { name: 'todos',       path: '/todos',                 wait: 1800 }, // 내 업무 (통합 할 일)
  { name: 'wbs-gantt',   path: '/projects/1/wbs',        wait: 3200, gantt: true }, // Gantt chart view
  { name: 'project-map', path: '/projects/1/map',        wait: 3500 }, // cytoscape layout
  { name: 'issues',      path: '/projects/1/issues' },
  { name: 'meetings',    path: '/projects/1/meetings' },
  { name: 'changelog',   path: '/projects/1/changelogs', wait: 2500 }, // echarts bar
  { name: 'devinfo',     path: '/projects/1/devinfo' },
  { name: 'monitoring',  path: '/monitoring',            wait: 3500 }, // echarts charts
  { name: 'worklog',     path: '/projects/1/worklog' },
  { name: 'settings',    path: '/settings' },
];

await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
// 프로젝트 페이지가 새 dual-pane 사이드바(아이콘 레일 + 프로젝트 패널)로 보이도록 프로젝트 1 자동선택.
await context.addInitScript((s) => {
  localStorage.setItem('pm-hub-settings', JSON.stringify(s));
}, { theme: 'dark', language: lang, autoSelectLastProject: true, lastProjectId: 1 });

const page = await context.newPage();
page.on('pageerror', (e) => console.warn('  ! page error:', e.message));

// Load '/' once so ProjectList populates the project store, which auto-selects project 1
// (autoSelectLastProject + lastProjectId in seeded settings) → the new dual-pane sidebar
// (icon rail + project panel) appears. Then navigate by SPA link clicks so the store —
// which has no persistence — survives across shots (a full page.goto would reset it).
const ganttLabel = lang === 'ko' ? '간트' : 'Gantt';
await page.goto(base + '/', { waitUntil: 'load', timeout: 30000 });
await page.waitForSelector('a[href="/projects/1/dashboard"]', { timeout: 20000 }); // project selected → project menu present

for (const s of SHOTS) {
  try {
    if (s.path === '/') {
      if (!page.url().endsWith('/')) await page.click('a[href="/"]');
    } else {
      await page.click(`a[href="${s.path}"]`);
    }
    if (s.gantt) {
      await page.waitForTimeout(600);
      await page.getByRole('button', { name: ganttLabel, exact: true }).click()
        .catch((e) => console.warn('  ! gantt toggle:', e.message));
    }
    // Let SPA data fetches + chart/graph rendering settle.
    await page.waitForTimeout(s.wait ?? 1400);
    await page.screenshot({ path: join(out, `${s.name}.png`) });
    console.log(`  + ${lang}/${s.name}.png`);
  } catch (e) {
    console.error(`  ! failed ${s.name}: ${e.message}`);
  }
}

await browser.close();
console.log(`done: ${lang} → ${out}`);
