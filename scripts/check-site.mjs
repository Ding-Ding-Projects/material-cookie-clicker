/**
 * Static checks for the published site under `site/`.
 *
 * Deliberately dependency-free and regex-based rather than DOM-parsed: this runs
 * in CI and on a clean checkout with no `node_modules`, and the properties it
 * checks (does this href resolve, is this address remote, is the viewport meta
 * present) are exactly the ones a missing dependency would silently skip.
 *
 * Run: node scripts/check-site.mjs
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'site');

/** The only external addresses this site is allowed to contain, as links only. */
const ALLOWED_EXTERNAL = [
  'https://github.com/Ding-Ding-Projects/material-cookie-clicker',
  'https://github.com/Ding-Ding-Projects/material-cookie-clicker/releases/latest',
  // The site's own published origin, referenced in site/README.md prose.
  'https://ding-ding-projects.github.io/material-cookie-clicker/',
];

const problems = [];
const notes = [];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(SITE);
const pages = files.filter((f) => f.endsWith('.html'));
const rel = (f) => relative(SITE, f).split(sep).join('/');

/* ------------------------------------------------------------ link resolution */

let linkCount = 0;
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(https?:|mailto:|data:)/.test(ref)) continue;
    linkCount += 1;
    const [pathPart, hash] = ref.split('#');
    if (!pathPart) {
      // Same-page anchor.
      if (hash && !new RegExp(`id="${hash}"`).test(html)) {
        problems.push(`${rel(page)}: anchor #${hash} has no matching id on the page`);
      }
      continue;
    }
    const target = resolve(dirname(page), pathPart);
    if (!existsSync(target)) {
      problems.push(`${rel(page)}: href "${ref}" does not resolve to a file`);
      continue;
    }
    if (hash) {
      const targetHtml = readFileSync(target, 'utf8');
      if (!new RegExp(`id="${hash}"`).test(targetHtml)) {
        problems.push(`${rel(page)}: "${ref}" resolves, but #${hash} is not an id in that file`);
      }
    }
  }
}

/* ------------------------------------------------- external addresses & fetches */

let externalCount = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/https?:\/\/[^\s"'`<>)]+/g)) {
    const url = match[0].replace(/[.,]$/, '');
    externalCount += 1;
    if (!ALLOWED_EXTERNAL.includes(url)) {
      problems.push(`${rel(file)}: unexpected external address ${url}`);
      continue;
    }
    // An allowed address is still only allowed as a link a person clicks.
    const asResource = new RegExp(`src="${url}"|url\\(["']?${url}`);
    if (asResource.test(text)) {
      problems.push(`${rel(file)}: ${url} is loaded as a resource, not linked`);
    }
  }
  for (const banned of ['fetch(', 'XMLHttpRequest', 'new WebSocket', 'navigator.sendBeacon', '@import url(']) {
    if (text.includes(banned)) problems.push(`${rel(file)}: contains "${banned}" — the site must make no network request`);
  }
}

/* ------------------------------------------------------------- page essentials */

const VOID_TAGS = new Set(['meta', 'link', 'br', 'hr', 'img', 'input', 'source', 'area', 'base', 'col']);
const HAN = /[㐀-鿿豈-﫿]/;

/** Returns each run of Han text that is not inside an element marked lang="zh-HK". */
function unmarkedHanText(html) {
  const offenders = [];
  /** One entry per open element: its tag name and whether it carries lang="zh-HK". */
  const stack = [];
  let zhDepth = 0;

  for (const token of html.split(/(<[^>]+>)/)) {
    if (!token.startsWith('<')) {
      if (zhDepth === 0 && HAN.test(token)) offenders.push(token.trim().slice(0, 40));
      continue;
    }
    if (token.startsWith('<!')) continue;
    if (token.startsWith('</')) {
      const tag = token.slice(2, -1).trim().toLowerCase();
      const openIndex = stack.map((e) => e.tag).lastIndexOf(tag);
      if (openIndex === -1) continue;
      for (const entry of stack.splice(openIndex)) {
        if (entry.zh) zhDepth -= 1;
      }
      continue;
    }
    const tag = token.slice(1).split(/[\s/>]/)[0].toLowerCase();
    if (VOID_TAGS.has(tag) || token.endsWith('/>')) continue;
    const zh = /lang="zh-HK"/.test(token);
    stack.push({ tag, zh });
    if (zh) zhDepth += 1;
  }
  return offenders;
}

for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const name = rel(page);
  if (!/<html lang="en">/.test(html)) problems.push(`${name}: <html> is missing lang="en"`);
  if (!/<meta name="viewport" content="width=device-width, initial-scale=1"/.test(html)) {
    problems.push(`${name}: missing the responsive viewport meta`);
  }
  if (!/<main /.test(html)) problems.push(`${name}: no <main> landmark`);
  if (!/<h1/.test(html)) problems.push(`${name}: no <h1>`);
  if (!/skip-link/.test(html)) problems.push(`${name}: no skip link`);
  const zh = (html.match(/lang="zh-HK"/g) || []).length;
  if (zh > 0) notes.push(`${name}: ${zh} Cantonese section(s) marked lang="zh-HK"`);
  // Any Han character outside a lang="zh-HK" element would be unmarked Cantonese.
  // Scanned with a tag stack rather than a regex, because the marked elements
  // nest and a non-greedy match closes on the wrong tag.
  for (const offender of unmarkedHanText(html)) {
    problems.push(`${name}: Han text outside a lang="zh-HK" element: ${offender}`);
  }
}

/* ------------------------------------------------------------------- reporting */

console.log(`Pages checked:      ${pages.length}`);
console.log(`Files checked:      ${files.length}`);
console.log(`Internal links:     ${linkCount}`);
console.log(`External addresses: ${externalCount} (all must be the GitHub repo or release URL)`);
for (const note of notes) console.log(`note: ${note}`);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('\nAll checks passed.');
