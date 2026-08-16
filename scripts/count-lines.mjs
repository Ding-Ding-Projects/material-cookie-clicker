import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const textExtensions = new Set(['.c', '.cc', '.cpp', '.css', '.h', '.hpp', '.html', '.js', '.json', '.jsonl', '.md', '.mjs', '.ps1', '.sh', '.toml', '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml']);
const agentIdentity = /(anthropic|claude|codex|openai|automation|\[bot\]|agent)/i;

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...options });
}

function trackedFiles() {
  return git(['ls-files', '-z']).split('\0').filter(Boolean).sort();
}

function categoryOf(file) {
  const normalized = file.replaceAll('\\', '/');
  const base = path.posix.basename(normalized);
  const extension = path.posix.extname(normalized).toLowerCase();
  if (/^(node_modules|dist|release|coverage|vendor|third_party)\//.test(normalized)) return 'Excluded vendor/build';
  if (/^(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(base)) return 'Excluded lockfiles';
  if (/^(tests|packages\/[^/]+\/test)\//.test(normalized) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized)) return 'Tests';
  if (/^(src|packages\/[^/]+\/src)\//.test(normalized) && /\.[cm]?[jt]sx?$/.test(normalized)) return 'Source';
  if (extension === '.css' || extension === '.html') return 'Styles and markup';
  if (extension === '.md' || /^(docs|wiki)\//.test(normalized)) return 'Documentation';
  if (/^(\.github|scripts)\//.test(normalized) || ['.json', '.yml', '.yaml', '.toml', '.ps1', '.sh', '.mjs'].includes(extension)) return 'Configuration and tooling';
  if (/^(data|generated)\//.test(normalized)) return 'Data and generated records';
  return 'Other project files';
}

function lineStats(file) {
  const buffer = readFileSync(path.join(root, file));
  if (!textExtensions.has(path.extname(file).toLowerCase()) || buffer.includes(0)) return null;
  const text = buffer.toString('utf8');
  if (!text) return { total: 0, nonblank: 0 };
  const lines = text.split(/\r\n|\n|\r/);
  if (lines.at(-1) === '') lines.pop();
  return { total: lines.length, nonblank: lines.filter((line) => line.trim().length > 0).length };
}

const commitAgentCache = new Map();
function isAgentCommit(commit) {
  if (/^0+$/.test(commit)) return null;
  if (commitAgentCache.has(commit)) return commitAgentCache.get(commit);
  let agent = false;
  try {
    const metadata = git(['show', '-s', '--format=%an%n%ae%n%B', commit]);
    agent = agentIdentity.test(metadata) || /co-authored-by:.*(anthropic|claude|codex|openai|agent)/i.test(metadata);
  } catch {
    agent = false;
  }
  commitAgentCache.set(commit, agent);
  return agent;
}

function attribution(file, expectedLines) {
  if (expectedLines === 0) return { agent: 0, people: 0, uncommitted: 0 };
  let porcelain;
  try {
    porcelain = git(['blame', '--line-porcelain', '--', file]);
  } catch {
    return { agent: 0, people: 0, uncommitted: expectedLines };
  }
  const commits = porcelain.match(/^[0-9a-f]{40} \d+ \d+(?: \d+)?$/gm)?.map((line) => line.slice(0, 40)) ?? [];
  const result = { agent: 0, people: 0, uncommitted: 0 };
  for (const commit of commits) {
    const authoredByAgent = isAgentCommit(commit);
    if (authoredByAgent === null) result.uncommitted += 1;
    else if (authoredByAgent) result.agent += 1;
    else result.people += 1;
  }
  const missing = expectedLines - commits.length;
  if (missing > 0) result.uncommitted += missing;
  return result;
}

const rows = new Map();
for (const file of trackedFiles()) {
  const stats = lineStats(file);
  if (!stats) continue;
  const category = categoryOf(file);
  const row = rows.get(category) ?? { category, files: 0, total: 0, nonblank: 0, agent: 0, people: 0, uncommitted: 0, attributed: !category.startsWith('Excluded ') };
  row.files += 1;
  row.total += stats.total;
  row.nonblank += stats.nonblank;
  if (row.attributed) {
    const ownership = attribution(file, stats.total);
    row.agent += ownership.agent;
    row.people += ownership.people;
    row.uncommitted += ownership.uncommitted;
  }
  rows.set(category, row);
}

const ordered = [...rows.values()].sort((a, b) => a.category.localeCompare(b.category));
const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);
const projectRows = ordered.filter((row) => row.attributed);
const project = {
  files: sum(projectRows, 'files'), total: sum(projectRows, 'total'), nonblank: sum(projectRows, 'nonblank'),
  agent: sum(projectRows, 'agent'), people: sum(projectRows, 'people'), uncommitted: sum(projectRows, 'uncommitted'),
};
const grand = { files: sum(ordered, 'files'), total: sum(ordered, 'total'), nonblank: sum(ordered, 'nonblank') };

if (project.agent + project.people + project.uncommitted !== project.total) {
  throw new Error(`Attribution arithmetic mismatch: ${project.agent} + ${project.people} + ${project.uncommitted} != ${project.total}`);
}

const report = { schemaVersion: 1, rows: ordered, project, grand, exclusions: ['dependency/vendor directories', 'build output', 'lockfiles from the project total'] };
if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  const lines = [
    '| Category | Files | Total lines | Non-blank | Agent-authored | People-authored | Uncommitted |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...ordered.map((row) => `| ${row.category} | ${row.files} | ${row.total} | ${row.nonblank} | ${row.attributed ? row.agent : 'excluded'} | ${row.attributed ? row.people : 'excluded'} | ${row.attributed ? row.uncommitted : 'excluded'} |`),
    `| **Project total** | **${project.files}** | **${project.total}** | **${project.nonblank}** | **${project.agent}** | **${project.people}** | **${project.uncommitted}** |`,
    `| **Grand total of tracked text** | **${grand.files}** | **${grand.total}** | **${grand.nonblank}** | — | — | — |`,
    '',
    'Project total excludes dependency/vendor trees, build output, and lockfiles. Agent attribution uses surviving `git blame` lines whose commit author or `Co-Authored-By` trailer identifies an agent or automation identity; churn and deleted lines are not counted.',
    '',
    'Reproduce with: `npm run count:lines`',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}
