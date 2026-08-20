import assert from 'node:assert/strict';
// Written against node:test, but this directory is run by vitest, which reported
// "No test suite found in file" and ran ZERO of the sixteen checks below — the file
// looked present while asserting nothing. vitest's `test` has the same
// (name, fn) shape, so importing it here keeps every assertion exactly as written.
import { test } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.RELEASE_CONTRACT_ROOT
  ? resolve(process.env.RELEASE_CONTRACT_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUPERSEDED_ICON_COMMIT = 'a98e38c07423a7cfb4cb3190412884a404a7245e';
const ONE_MIB = 1024 * 1024;

function read(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), 'utf8').replaceAll('\r\n', '\n');
}

function parseSafeIntegerExpression(expression, source = '') {
  const raw = expression.trim();
  const identifier = raw.replaceAll(' ', '');
  if (/^[A-Za-z_$][\w$]*$/.test(identifier)) {
    const declaration = source.match(new RegExp(`(?:export\\s+)?const\\s+${identifier}\\s*=\\s*([^;\\n]+)`));
    assert.ok(declaration, `maxBuffer constant ${identifier} must be declared`);
    return parseSafeIntegerExpression(declaration[1], source);
  }
  const compact = raw.replaceAll('_', '').replaceAll(' ', '');
  assert.match(compact, /^\d+(?:\*\d+)*$/, `maxBuffer must be a numeric arithmetic expression, got ${expression}`);
  return compact.split('*').map(Number).reduce((left, right) => left * right, 1);
}

function assertCountLinesContract(source) {
  const gitCall = source.match(/execFileSync\(\s*['"]git['"]\s*,\s*args\s*,\s*\{([\s\S]*?)\}\s*\)/);
  assert.ok(gitCall, 'count-lines must call git through an explicit options object');
  const maxBuffer = gitCall[1].match(/\bmaxBuffer\s*:\s*([^,}\n]+)/);
  assert.ok(maxBuffer, 'count-lines git execution must declare an explicit maxBuffer');
  assert.ok(
    parseSafeIntegerExpression(maxBuffer[1], source) > ONE_MIB,
    'count-lines maxBuffer must exceed one MiB for a large blame payload',
  );

  const attributionCatch = source.match(
    /function attribution[\s\S]*?try\s*\{[\s\S]*?\}\s*catch(?:\s*\([^)]*\))?\s*\{([\s\S]*?)\}\s*const commits/,
  );
  assert.ok(attributionCatch, 'attribution must have an explicit git-execution failure path');
  assert.doesNotMatch(
    attributionCatch[1],
    /uncommitted\s*:\s*expectedLines/,
    'a git execution failure must not be silently relabelled as every line being uncommitted',
  );
  assert.match(
    attributionCatch[1],
    /\b(?:throw|error|failed|failure|status|exec)\b/i,
    'the attribution failure path must preserve or surface the execution failure',
  );
}

function findPublicationIndex(workflow) {
  const matches = [
    ...workflow.matchAll(/--draft\s*=\s*false/gi),
    ...workflow.matchAll(/\bdraft\s*[:=]\s*false/gi),
  ].map((match) => match.index).filter((index) => index !== undefined);
  assert.ok(matches.length > 0, 'release workflow must have an explicit draft-to-published transition');
  return Math.min(...matches);
}

function assertTimingContract(workflow) {
  assert.match(
    workflow,
    /gh\s+api[^\n]*actions\/runs[^\n]*\/jobs|actions\/runs[^\n]*\/jobs[^\n]*gh\s+api/i,
    'release timing must read actual job evidence from the workflow run jobs endpoint',
  );
  assert.match(workflow, /\bstarted_at\b/, 'release timing must retain the first job started_at field');
  assert.doesNotMatch(
    workflow,
    /started_at\s*=\s*.*Get-Date/i,
    'first-job started_at must not be invented solely with a local clock read',
  );

  const publicationIndex = findPublicationIndex(workflow);
  const completion = workflow.match(/\$completed\s*=\s*\[DateTimeOffset\]::UtcNow/);
  assert.ok(completion?.index !== undefined, 'release workflow must capture one explicit UTC completion boundary');
  const manifestUploadIndex = workflow.indexOf("Upload-DraftAsset -ReleaseId $releaseId -Path 'release-stage/release-changelog.json'");
  assert.ok(manifestUploadIndex >= 0, 'completion timing must account for the final release-manifest upload');
  assert.ok(completion.index > manifestUploadIndex, 'completion timing must be captured after every draft asset is uploaded');
  assert.ok(completion.index < publicationIndex, 'completion timing must feed the one atomic notes-and-publication mutation');
  assert.doesNotMatch(
    workflow,
    /\$completed\s*=\s*\[DateTimeOffset\]::Parse\(\s*\$publishedAt\s*\)/i,
    'completion timing must not be copied from release published_at',
  );
  assert.match(
    workflow,
    /\$publishedAtText[\s\S]{0,400}-ne\s+\$completedText/,
    'the final publication response must verify the exact completion second written to the notes',
  );
}

function assertNumericDraftLifecycle(workflow) {
  assert.match(workflow, /\$releaseId\b|\$draftReleaseId\b/, 'draft lifecycle must retain a numeric release id');
  assert.match(
    workflow,
    /releases\?(?:[^\n]*per_page|[^\n]*)|releases\/tags\//i,
    'draft creation must inspect the release inventory or tag endpoint',
  );
  assert.match(
    workflow,
    /\$\w*releaseId\s*=\s*\[long\][^\n]*\.id|\$\w*releaseId\s*=\s*[^\n]*\.id/i,
    'draft creation must resolve and retain the numeric release id',
  );
  assert.doesNotMatch(
    workflow,
    /gh\s+release\s+(?:edit|upload)\s+\$env:RELEASE_TAG/i,
    'draft edits and uploads must not address the release by tag',
  );
  assert.match(
    workflow,
    /releases\/\$(?:releaseId|draftReleaseId)(?:\/assets|['"])/i,
    'draft edits/uploads must address the numeric release id endpoint',
  );
  assert.match(
    workflow,
    /https:\/\/uploads\.github\.com\/repos\/\$env:GITHUB_REPOSITORY\/releases\/\$ReleaseId\/assets/i,
    'draft binary assets must use the release-specific uploads.github.com endpoint',
  );
  assert.doesNotMatch(workflow, /api\.uploads\.github\.com/i, 'GitHub CLI must not synthesize the invalid api.uploads.github.com host');

  const publicationIndex = findPublicationIndex(workflow);
  for (const asset of ['installer-evidence.json', 'line-count.md', 'release-dish.json', 'release-changelog.json']) {
    const index = workflow.indexOf(asset);
    assert.ok(index >= 0, `release workflow must name required asset ${asset}`);
    assert.ok(index < publicationIndex, `${asset} must be ready before publication`);
  }
  const notesIndex = workflow.indexOf('release-notes.md');
  assert.ok(notesIndex >= 0 && notesIndex < publicationIndex, 'final release notes must be ready before publication');
}

function assertEveryGhInvocationChecked(workflow) {
  const lines = workflow.split('\n');
  const invocations = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => !/^\s*#/.test(line) && /\bgh\s+(?:api|release)\b/.test(line));
  assert.ok(invocations.length > 0, 'release workflow must contain GitHub CLI operations');
  for (const { line, index } of invocations) {
    const window = lines.slice(index, index + 9).join('\n');
    assert.match(
      window,
      /\$LASTEXITCODE\b|Invoke-GhChecked\b/,
      `native GitHub CLI command lacks explicit exit checking: ${line.trim()}`,
    );
  }
}

function assertFinalVerificationContract(workflow) {
  assert.match(workflow, /gh\s+release\s+view[^\n]*(?:isDraft|draft)|Read-ReleaseById[\s\S]{0,800}\.draft/i);
  assert.match(workflow, /\$(?:\w+\.)?(?:isDraft|draft)\b[^\n]*(?:-ne|-eq)\s+\$?false/i);
  assert.match(workflow, /targetCommitish|target_commitish|sourceCommit/i);
  assert.match(workflow, /\$\w*(?:expected|required)(?:Assets|AssetNames)\b/i, 'final verification must declare the exact required asset set');
  assert.match(
    workflow,
    /Compare-Object|SetEquals|SequenceEqual|Sort-Object[\s\S]{0,260}(?:-ne|\.Count|join)/i,
    'final verification must compare the observed asset set with the exact required set',
  );
}

function assertTriggerAndNoQualityCommands(workflow, ciWorkflow) {
  const lines = workflow.split('\n');
  const pushIndex = lines.findIndex((line) => /^\s{2}push:\s*/.test(line));
  assert.ok(pushIndex >= 0, 'release workflow must declare a push trigger');
  const pushIndent = lines[pushIndex].match(/^\s*/)[0].length;
  const pushBlock = [];
  for (let index = pushIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*$/.test(line)) {
      pushBlock.push(line);
      continue;
    }
    const indent = line.match(/^\s*/)[0].length;
    if (indent <= pushIndent) break;
    pushBlock.push(line);
  }
  const pushText = pushBlock.join('\n');
  assert.doesNotMatch(pushText, /^\s{4}(?:paths|paths-ignore|tags|tags-ignore):/m, 'push release trigger must not be filtered');
  const branchBlock = pushText.match(/^\s{4}branches:\s*\n([\s\S]*?)(?=^\s{4}\w[\w-]*:\s*|$)/m);
  if (branchBlock) {
    const branches = [...branchBlock[1].matchAll(/^\s*-\s*['"]?([^'"\s]+)['"]?\s*$/gm)].map((match) => match[1]);
    assert.deepEqual(branches, ['**'], 'a push release trigger may only use the explicit all-branches wildcard');
  }
  assert.match(workflow, /^\s{2}workflow_dispatch:\s*(?:\{\})?\s*$/m, 'release workflow must support manual dispatch');

  const forbidden = /\b(?:npm\s+(?:test|run\s+(?:test|check|typecheck|lint|static-analysis|coverage))|vitest(?:\s|$)|eslint(?:\s|$)|tsc\s+(?:-p|--noEmit)|static-analysis|type-check)\b/i;
  assert.doesNotMatch(workflow, forbidden, 'release workflow must not run test, lint, typecheck, or static-analysis commands');
  assert.doesNotMatch(ciWorkflow, forbidden, 'CI workflow must not run test, lint, typecheck, or static-analysis commands');
  assert.doesNotMatch(ciWorkflow, /^\s{2}workflow_dispatch:/m, 'manual dispatch must have one release-producing workflow, not a build-only duplicate');
}

test('count-lines keeps large blame output bounded and execution failures visible', () => {
  assertCountLinesContract(read('scripts/count-lines.mjs'));
});

test('release timing uses first-job evidence and the final atomic-publication boundary', () => {
  assertTimingContract(read('.github/workflows/release.yml'));
});

test('draft release lifecycle uses numeric ids and prepares final assets before publication', () => {
  assertNumericDraftLifecycle(read('.github/workflows/release.yml'));
});

test('every native GitHub CLI invocation has explicit exit checking', () => {
  assertEveryGhInvocationChecked(read('.github/workflows/release.yml'));
});

test('final release verification proves non-draft state and exact required assets', () => {
  assertFinalVerificationContract(read('.github/workflows/release.yml'));
});

test('release triggers every push and dispatch without quality-gate commands', () => {
  assertTriggerAndNoQualityCommands(read('.github/workflows/release.yml'), read('.github/workflows/ci.yml'));
});

test('Squirrel icon URL is immutable, version-neutral, and not the superseded asset', () => {
  const packageJson = JSON.parse(read('package.json'));
  const iconUrl = packageJson.build?.squirrelWindows?.iconUrl;
  assert.match(
    iconUrl,
    /^https:\/\/raw\.githubusercontent\.com\/Ding-Ding-Projects\/material-cookie-clicker\/[0-9a-f]{40}\/assets\/material-cookie-clicker\.ico$/,
  );
  assert.doesNotMatch(iconUrl, /(?:\/main\/|\/latest\/|\/v\d)/i);
  assert.doesNotMatch(iconUrl, new RegExp(SUPERSEDED_ICON_COMMIT));
});

test('negative regression fixtures make each contract fail when its evidence disappears', () => {
  const countLines = read('scripts/count-lines.mjs');
  assert.throws(() => assertCountLinesContract(countLines.replace(/\bmaxBuffer\s*:[^,}\n]+,?/g, '')), /maxBuffer/);
  const countLinesWithBuffer = countLines.replace(
    /execFileSync\(\s*['"]git['"]\s*,\s*args\s*,\s*\{/,
    "execFileSync('git', args, { maxBuffer: 8 * 1024 * 1024,",
  );
  const attributionStart = countLinesWithBuffer.indexOf('function attribution');
  assert.ok(attributionStart >= 0);
  const attributionSuffix = countLinesWithBuffer.slice(attributionStart).replace(
    /catch\s*\([^)]*\)\s*\{[\s\S]*?throw new Error\([\s\S]*?\);\s*\}/,
    'catch (error) { return { agent: 0, people: 0, uncommitted: expectedLines }; }',
  );
  const brokenAttribution = countLinesWithBuffer.slice(0, attributionStart) + attributionSuffix;
  assert.throws(
    () => assertCountLinesContract(brokenAttribution),
    /failure path|execution failure|attribution/i,
  );

  const workflow = read('.github/workflows/release.yml');
  const triggerReady = workflow.replace(/  push:\n    branches:\n      - ['"]\*\*['"]/, '  push: {}');
  const ciWorkflow = read('.github/workflows/ci.yml');
  assert.throws(() => assertTriggerAndNoQualityCommands(triggerReady.replace('workflow_dispatch: {}', 'workflow_dispatch: {}\n      - run: npm test'), ciWorkflow), /AssertionError/);
  assert.throws(() => assertTriggerAndNoQualityCommands(workflow, ciWorkflow.replace('  push:', '  push:\n  workflow_dispatch: {}')), /manual dispatch/);
  const completionAssignment = '$completed = [DateTimeOffset]::UtcNow';
  const finalManifestUpload = "Upload-DraftAsset -ReleaseId $releaseId -Path 'release-stage/release-changelog.json'";
  const brokenTiming = workflow
    .replace(completionAssignment, '# completion assignment moved')
    .replace(finalManifestUpload, `${completionAssignment}\n          ${finalManifestUpload}`);
  assert.throws(() => assertTimingContract(brokenTiming), /after every draft asset/);
  assert.throws(() => assertNumericDraftLifecycle(workflow.replace('$releaseId = [long]$draftMatches[0].id', '$releaseId = $draftMatches[0].tag_name')), /AssertionError/);
  assert.throws(() => assertFinalVerificationContract(workflow.replaceAll('$expectedAssetNames', '$expectedNames')), /AssertionError/);

  const packageJson = read('package.json');
  assert.throws(() => {
    const broken = JSON.parse(packageJson);
    broken.build.squirrelWindows.iconUrl = `https://raw.githubusercontent.com/Ding-Ding-Projects/material-cookie-clicker/${SUPERSEDED_ICON_COMMIT}/assets/material-cookie-clicker.ico`;
    const url = broken.build.squirrelWindows.iconUrl;
    assert.doesNotMatch(url, new RegExp(SUPERSEDED_ICON_COMMIT));
  }, /superseded|a98e38c|Expected pattern/);
});
