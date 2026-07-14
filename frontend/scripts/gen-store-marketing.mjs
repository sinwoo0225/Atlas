// Generates production-grade Microsoft Store marketing screenshots (1920x1080 PNG).
//
// Composites raw app captures (from capture-screenshots.ps1) onto a branded dark canvas
// with the Atlas wordmark + a headline/subcopy, rendered via Playwright/Chromium for
// designer-grade rounded window frames, shadows, gradients, and web fonts.
//
//   node scripts/gen-store-marketing.mjs            # both ko + en
//   node scripts/gen-store-marketing.mjs --lang ko  # one language
//
// Inputs : <root>/store/screenshots/<lang>/<name>.png
// Output : <root>/store/marketing-ko/NN-<name>.png, <root>/store/marketing-en/NN-<name>.png

import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..'); // repo root (frontend/scripts -> ../..)

const argv = process.argv.slice(2);
const langArg = (() => { const i = argv.indexOf('--lang'); return i >= 0 ? argv[i + 1] : null; })();
const LANGS = langArg ? [langArg] : ['ko', 'en'];

// raw capture source per language
const rawDir = (lang) => join(ROOT, 'store', 'screenshots', lang);
const outDir = (lang) => join(ROOT, 'store', `marketing-${lang}`);
const LOGO = join(ROOT, 'frontend', 'public', 'icons', 'atlas-v2-monogram.png');

// 10 slides — similar-purpose screens grouped, ≤10 per Store limit.
const SLIDES = [
  { n: '01', img: 'projects',
    ko: { head: '여러 프로젝트를\n한 화면에서', sub: '카드 목록과 대시보드로 모든 프로젝트의\n진행 상황을 한눈에 봅니다.' },
    en: { head: 'Every project,\none screen', sub: 'A card list and dashboards keep all your\nprojects in view at a glance.' } },
  { n: '02', img: 'wbs-gantt',
    ko: { head: '일정과 진행을\n간트로', sub: '계층 작업 트리·마일스톤·담당자.\n계획과 실적을 함께 추적합니다.' },
    en: { head: 'Plan it on\na Gantt', sub: 'Hierarchical tasks, milestones, assignees —\ntrack planned vs. actual together.' } },
  { n: '03', img: 'todos',
    ko: { head: '내 할 일과\n회고를 한 곳에', sub: '전 프로젝트의 작업·이슈·개인 할 일을 모아 보고,\n완료 프로젝트는 회고로 되돌아봅니다.' },
    en: { head: 'Your to-dos,\nand retrospectives', sub: 'Tasks, issues, and personal to-dos in one place —\nthen look back on finished projects.' } },
  { n: '04', img: 'issues',
    ko: { head: '이슈를\n표에서 바로', sub: '상태와 우선순위를 표에서 인라인으로\n빠르게 바꿉니다.' },
    en: { head: 'Issues, edited\ninline', sub: 'Change status and priority right in the\ntable — fast.' } },
  { n: '05', img: 'meetings',
    ko: { head: '회의록을\n구조적으로', sub: '내부/외부 구분, 참석자·결정·액션 아이템.\n마크다운으로 자동 내보내기.' },
    en: { head: 'Meetings,\nstructured', sub: 'Internal/external, attendees, decisions, actions —\nauto-exported as Markdown.' } },
  { n: '06', img: 'devinfo',
    ko: { head: '업무 자료와\n깃 저장소', sub: '문서·링크·파일과 프로젝트 깃 저장소를\n한곳에 묶고 커밋 그래프까지.' },
    en: { head: 'Work info &\nGit repos', sub: 'Docs, links, files, and project Git repos\ntogether — with a commit graph.' } },
  { n: '07', img: 'project-map',
    ko: { head: '관계를\n지도로', sub: '작업·이슈·회의·자료의 연결을\n그래프로 시각화합니다.' },
    en: { head: 'See it as\na map', sub: 'Visualize how tasks, issues, meetings, and\nnotes connect as a graph.' } },
  { n: '08', img: 'monitoring',
    ko: { head: '전 프로젝트\n통합 모니터링', sub: '종합 차트와 담당자×마감 히트맵으로\n포트폴리오를 한눈에.' },
    en: { head: 'Monitor every\nproject', sub: 'Cross-project charts and an assignee × deadline\nheatmap for the whole portfolio.' } },
  { n: '09', img: 'dashboard',
    ko: { head: '프로젝트\n현황 대시보드', sub: '개요·예산·인원·D-day·최근 활동을\n한 화면에 정리합니다.' },
    en: { head: 'A project\ndashboard', sub: 'Overview, budget, members, D-day, and recent\nactivity on one screen.' } },
  { n: '10', img: 'settings',
    ko: { head: '내 방식대로,\n로컬 우선', sub: '다크/라이트·커스텀 테마, 한국어/영어 전환.\n모든 데이터는 내 PC에.' },
    en: { head: 'Your way,\nlocal-first', sub: 'Dark/light & custom themes, Korean/English.\nAll data stays on your PC.' } },
];

const asDataUri = async (p) => `data:image/png;base64,${(await readFile(p)).toString('base64')}`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function html({ logo, shot, head, sub, font }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1920px; height:1080px; }
  .stage { position:relative; width:1920px; height:1080px; overflow:hidden;
    background:#0a0d14; font-family:${font}; }
  .bg { position:absolute; inset:0;
    background:
      radial-gradient(1100px 900px at 78% 52%, rgba(124,141,181,0.20), rgba(124,141,181,0) 60%),
      radial-gradient(900px 700px at 70% 80%, rgba(201,169,107,0.10), rgba(201,169,107,0) 60%),
      linear-gradient(160deg, #0c0f17 0%, #0a0d13 55%, #090b11 100%); }
  .vignette { position:absolute; inset:0; box-shadow: inset 0 0 320px rgba(0,0,0,0.55); }
  .brand { position:absolute; top:62px; left:96px; display:flex; align-items:center; gap:16px; z-index:3; }
  .brand img { width:46px; height:46px; display:block; }
  .brand .name { font-size:27px; font-weight:700; letter-spacing:-0.01em; }
  .brand .at { color:#aeb9d4; } .brand .las { color:#c9a96b; }
  .copy { position:absolute; left:96px; top:50%; transform:translateY(-50%); width:660px; z-index:3; }
  .accent { width:62px; height:6px; border-radius:3px; background:#c9a96b; margin-bottom:30px; }
  .head { font-size:54px; line-height:1.16; font-weight:800; letter-spacing:-0.02em;
    color:#f3f6fb; white-space:pre-line; }
  .sub { margin-top:24px; font-size:22px; line-height:1.55; color:#9aa6b8; white-space:pre-line; font-weight:400; }
  .shot { position:absolute; right:-70px; top:50%; transform:translateY(-50%); width:1200px; z-index:2; }
  .window { border-radius:16px; overflow:hidden; border:1px solid rgba(255,255,255,0.09);
    box-shadow: 0 50px 90px -30px rgba(0,0,0,0.7), 0 18px 40px -20px rgba(0,0,0,0.55); }
  .window img { width:100%; display:block; }
  </style></head><body>
  <div class="stage">
    <div class="bg"></div><div class="vignette"></div>
    <div class="brand"><img src="${logo}"><span class="name"><span class="at">At</span><span class="las">las</span></span></div>
    <div class="copy"><div class="accent"></div><h1 class="head">${esc(head)}</h1><p class="sub">${esc(sub)}</p></div>
    <div class="shot"><div class="window"><img src="${shot}"></div></div>
  </div></body></html>`;
}

const browser = await chromium.launch();
const logoUri = await asDataUri(LOGO);

for (const lang of LANGS) {
  const od = outDir(lang);
  await mkdir(od, { recursive: true });
  const font = lang === 'ko'
    ? `'Malgun Gothic','Segoe UI',sans-serif`
    : `'Segoe UI','Malgun Gothic',sans-serif`;
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const s of SLIDES) {
    const shotUri = await asDataUri(join(rawDir(lang), `${s.img}.png`));
    const c = s[lang];
    await page.setContent(html({ logo: logoUri, shot: shotUri, head: c.head, sub: c.sub, font }), { waitUntil: 'load' });
    await page.waitForTimeout(150);
    const outPath = join(od, `${s.n}-${s.img}.png`);
    await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    console.log(`  + ${lang}/${s.n}-${s.img}.png`);
  }
  await ctx.close();
}

await browser.close();
console.log('done: store/marketing-ko + store/marketing-en');
