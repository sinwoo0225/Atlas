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
const SHOTS = [
  { name: 'projects',    path: '/' },
  { name: 'dashboard',   path: '/projects/1/dashboard', wait: 2500 },
  { name: 'wbs-gantt',   path: '/projects/1/wbs',        wait: 2500 },
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
await context.addInitScript((s) => {
  localStorage.setItem('pm-hub-settings', JSON.stringify(s));
}, { theme: 'dark', language: lang, autoSelectLastProject: false });

const page = await context.newPage();
page.on('pageerror', (e) => console.warn('  ! page error:', e.message));

for (const s of SHOTS) {
  try {
    await page.goto(base + s.path, { waitUntil: 'load', timeout: 30000 });
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
