// Generates public/THIRD-PARTY-NOTICES.txt from the production dependency closure.
//
// Why: Atlas is proprietary, but the shipped app bundles open-source libraries
// (React, ECharts, Cytoscape, …). Permissive licenses (MIT/BSD/ISC/Apache/MPL/CC-BY)
// require their copyright + license text to travel with the distribution. This file
// collects every package reachable from package.json "dependencies" (transitively)
// and emits one notice block per package. Run after dependency changes:
//   npm run notices
//
// Scope = production deps only (devDependencies such as vite/eslint/typescript are
// build tools, not shipped). Over-inclusion is harmless; under-inclusion is not, so
// the closure is computed conservatively from declared "dependencies".

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rootModules = join(root, 'node_modules');

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

// Resolve a package dir honoring npm hoisting: prefer the requiring package's own
// nested node_modules, then fall back to the top-level node_modules.
function resolvePkgDir(name, fromDir) {
  const candidates = [join(fromDir, 'node_modules', name), join(rootModules, name)];
  for (const c of candidates) {
    if (existsSync(join(c, 'package.json'))) return c;
  }
  return null;
}

function normalizeLicense(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && typeof pkg.license === 'object' && pkg.license.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type || l).join(' OR ');
  return 'UNKNOWN';
}

function normalizeAuthor(pkg) {
  if (typeof pkg.author === 'string') return pkg.author;
  if (pkg.author && pkg.author.name) {
    return pkg.author.name + (pkg.author.email ? ` <${pkg.author.email}>` : '');
  }
  return '';
}

function repoUrl(pkg) {
  const r = pkg.repository;
  if (typeof r === 'string') return r;
  if (r && r.url) return r.url.replace(/^git\+/, '').replace(/\.git$/, '');
  return pkg.homepage || '';
}

const LICENSE_FILE_RE = /^(licen[sc]e|copying|notice)/i;

function readLicenseText(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return '';
  }
  const match = entries.find((f) => LICENSE_FILE_RE.test(f));
  if (!match) return '';
  try {
    return readFileSync(join(dir, match), 'utf8').trim();
  } catch {
    return '';
  }
}

// BFS over the production dependency graph.
const rootPkg = readJson(join(root, 'package.json'));
const seenDir = new Set();
const collected = new Map(); // key: name@version

const queue = Object.keys(rootPkg.dependencies || {}).map((name) => ({ name, fromDir: root }));

while (queue.length) {
  const { name, fromDir } = queue.shift();
  const dir = resolvePkgDir(name, fromDir);
  if (!dir || seenDir.has(dir)) continue;
  seenDir.add(dir);

  const pkg = readJson(join(dir, 'package.json'));
  if (!pkg) continue;

  const key = `${pkg.name}@${pkg.version}`;
  if (!collected.has(key)) {
    collected.set(key, {
      name: pkg.name,
      version: pkg.version,
      license: normalizeLicense(pkg),
      author: normalizeAuthor(pkg),
      repo: repoUrl(pkg),
      text: readLicenseText(dir),
    });
  }

  const deps = { ...pkg.dependencies, ...pkg.optionalDependencies };
  for (const dep of Object.keys(deps)) queue.push({ name: dep, fromDir: dir });
}

const items = [...collected.values()].sort((a, b) => a.name.localeCompare(b.name));

// License-type breakdown for the header.
const breakdown = {};
for (const it of items) breakdown[it.license] = (breakdown[it.license] || 0) + 1;
const breakdownLines = Object.entries(breakdown)
  .sort((a, b) => b[1] - a[1])
  .map(([lic, n]) => `  ${n.toString().padStart(4)}  ${lic}`)
  .join('\n');

const SEP = '='.repeat(78);
const header = `Atlas — Third-Party Software Notices
${SEP}

Atlas is proprietary software (Copyright (c) 2026 SlnU. All rights reserved).
It is built using the open-source components listed below. Each component is the
property of its respective copyright holders and is used under the terms of its
license. These notices are provided to satisfy the attribution requirements of
those licenses; they do not affect the proprietary license of Atlas itself.

This list covers the production dependencies bundled in the application
(${items.length} packages). Build-only tooling is not distributed and is omitted.

License types:
${breakdownLines}

${SEP}
`;

const blocks = items.map((it) => {
  const meta = [
    `${it.name}  ${it.version}`,
    `License: ${it.license}`,
    it.author ? `Author: ${it.author}` : null,
    it.repo ? `Source: ${it.repo}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const body = it.text
    ? it.text
    : `(No license file shipped in this package. Distributed under the ${it.license} license.)`;
  return `${SEP}\n${meta}\n\n${body}\n`;
});

const out = header + '\n' + blocks.join('\n');
const outPath = join(root, 'public', 'THIRD-PARTY-NOTICES.txt');
writeFileSync(outPath, out, 'utf8');

console.log(`Wrote ${outPath}`);
console.log(`Packages: ${items.length}`);
console.log('License breakdown:');
console.log(breakdownLines);
