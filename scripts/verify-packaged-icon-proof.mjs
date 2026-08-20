#!/usr/bin/env node
/** Validate Setup.exe and packaged-application icon extraction evidence. */
import { execFileSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectIco, sha256, verifyBrandReleaseIntegrity } from './verify-brand-release-integrity.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), '..');
const SOURCE_ICON = 'assets/material-cookie-clicker.ico';
const SUPPORTED_MANIFESTS = new Set([
  'material-cookie-clicker.local-installer.v2',
  'material-cookie-clicker.workflow-installer.v1',
]);
const EXPECTED_KINDS = ['setup', 'application'];
const EXPECTED_SIZES = [16, 32];
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(`Packaged icon proof failed: ${message}`);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

export function decodePngRgba(bytes) {
  const png = Buffer.from(bytes);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (png.length < 8 || !png.subarray(0, 8).equals(signature)) fail('an extracted icon is not a PNG.');
  let offset = 8;
  let width;
  let height;
  const idat = [];
  let sawHeader = false;
  let sawEnd = false;
  while (offset < png.length) {
    if (offset + 12 > png.length) fail('an extracted PNG has a truncated chunk header.');
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;
    if (crcOffset + 4 > png.length) fail(`an extracted PNG has a truncated ${type} chunk.`);
    const chunkData = png.subarray(dataStart, dataEnd);
    const expectedCrc = png.readUInt32BE(crcOffset);
    const actualCrc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), chunkData]));
    if (expectedCrc !== actualCrc) fail(`an extracted PNG has an invalid ${type} CRC.`);
    if (type === 'IHDR') {
      if (sawHeader || length !== 13) fail('an extracted PNG must have one 13-byte IHDR.');
      sawHeader = true;
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      if (chunkData[8] !== 8 || chunkData[9] !== 6 || chunkData[10] !== 0 || chunkData[11] !== 0 || chunkData[12] !== 0) {
        fail('extracted icon PNGs must be non-interlaced 8-bit RGBA images.');
      }
    } else if (type === 'IDAT') idat.push(chunkData);
    else if (type === 'IEND') {
      if (length !== 0) fail('an extracted PNG has a non-empty IEND chunk.');
      sawEnd = true;
      offset = crcOffset + 4;
      break;
    } else if ((type.charCodeAt(0) & 0x20) === 0) fail(`an extracted PNG contains unsupported critical chunk ${type}.`);
    offset = crcOffset + 4;
  }
  if (!sawHeader || !sawEnd || idat.length === 0 || offset !== png.length) fail('an extracted PNG is missing IHDR, IDAT, IEND, or has trailing bytes.');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 256 || height > 256) fail('an extracted PNG has invalid or excessive dimensions.');

  let inflated;
  try { inflated = inflateSync(Buffer.concat(idat)); } catch { fail('an extracted PNG has invalid compressed image data.'); }
  const rowBytes = width * 4;
  if (inflated.length !== (rowBytes + 1) * height) fail('an extracted PNG has an unexpected decompressed byte count.');
  const pixels = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (rowBytes + 1);
    const filter = inflated[rowStart];
    if (filter > 4) fail(`an extracted PNG uses unsupported filter ${filter}.`);
    const outputStart = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = inflated[rowStart + 1 + x];
      const left = x >= 4 ? pixels[outputStart + x - 4] : 0;
      const up = y > 0 ? pixels[outputStart - rowBytes + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[outputStart - rowBytes + x - 4] : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else value = raw + paeth(left, up, upperLeft);
      pixels[outputStart + x] = value & 0xff;
    }
  }
  return { width, height, pixels };
}

function containedPath(root, relativePath) {
  if (typeof relativePath !== 'string' || !/^[^/\\]+\.png$/.test(relativePath)) fail('icon proof paths must be one local PNG filename.');
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (path.dirname(resolved) !== resolvedRoot) fail(`icon proof path escapes its root: ${relativePath}.`);
  return resolved;
}

function requireSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) fail(`${label} must be a lowercase SHA-256.`);
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) fail(`${label} must be a positive integer.`);
}

function requireExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) fail(`${label} fields are ${actual.join(', ')}; expected exactly ${required.join(', ')}.`);
}

async function executableRecord(executablePath) {
  const file = await stat(executablePath);
  if (!file.isFile() || file.size < 1) fail(`packaged executable is missing or empty: ${executablePath}.`);
  const bytes = await readFile(executablePath);
  if (bytes.length < 68 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) fail(`packaged executable is not a PE image: ${executablePath}.`);
  const peOffset = bytes.readUInt32LE(0x3c);
  if (peOffset < 64 || peOffset + 4 > bytes.length || !bytes.subarray(peOffset, peOffset + 4).equals(Buffer.from([0x50, 0x45, 0, 0]))) {
    fail(`packaged executable has no valid PE signature: ${executablePath}.`);
  }
  return { name: path.basename(executablePath), bytes: bytes.length, sha256: sha256(bytes) };
}

function cloneManifest(manifest) {
  return JSON.parse(JSON.stringify(manifest));
}

export function validateNormalizedPackagedIconProof(proof) {
  requireExactKeys(proof, ['schemaVersion', 'sourceCommit', 'sourceIcon', 'artifacts', 'verifiedAt'], 'normalized proof');
  if (proof.schemaVersion !== 'material-cookie-clicker.packaged-icon-proof.v1') fail('normalized proof has the wrong schemaVersion.');
  if (!COMMIT_PATTERN.test(proof.sourceCommit ?? '')) fail('normalized proof sourceCommit must be a full lowercase Git SHA.');
  requireExactKeys(proof.sourceIcon, ['path', 'bytes', 'sha256', 'frames'], 'normalized source icon');
  if (proof.sourceIcon?.path !== SOURCE_ICON) fail('normalized proof must bind the canonical source ICO path.');
  requirePositiveInteger(proof.sourceIcon?.bytes, 'normalized source icon bytes');
  requireSha256(proof.sourceIcon?.sha256, 'normalized source icon digest');
  if (JSON.stringify(proof.sourceIcon?.frames?.map((frame) => frame.size)) !== JSON.stringify([16, 32, 48, 256])) fail('normalized proof must list source frames in exact canonical order.');
  for (const frame of proof.sourceIcon.frames) {
    requireExactKeys(frame, ['size', 'pixelSha256'], `${frame.size}px normalized source frame`);
    requireSha256(frame.pixelSha256, `${frame.size}px source-frame pixel digest`);
  }
  if (JSON.stringify(proof.artifacts?.map((artifact) => artifact.kind)) !== JSON.stringify(EXPECTED_KINDS)) fail('normalized proof must contain setup then application exactly once.');
  for (const artifact of proof.artifacts) {
    requireExactKeys(artifact, ['kind', 'executable', 'extractedIcons'], `${artifact.kind} normalized artifact`);
    requireExactKeys(artifact.executable, ['name', 'bytes', 'sha256'], `${artifact.kind} normalized executable`);
    if (!artifact.executable?.name) fail(`${artifact.kind} executable name is missing.`);
    requirePositiveInteger(artifact.executable.bytes, `${artifact.kind} executable bytes`);
    requireSha256(artifact.executable.sha256, `${artifact.kind} executable digest`);
    if (JSON.stringify(artifact.extractedIcons?.map((icon) => icon.size)) !== JSON.stringify(EXPECTED_SIZES)) fail(`${artifact.kind} must contain exact 16px and 32px extraction proof in order.`);
    for (const icon of artifact.extractedIcons) {
      requireExactKeys(icon, ['size', 'path', 'bytes', 'sha256', 'pixelSha256', 'sourcePixelSha256', 'matchesSource'], `${artifact.kind} ${icon.size}px normalized extraction`);
      if (!/^[^/\\]+\.png$/.test(icon.path ?? '')) fail(`${artifact.kind} ${icon.size}px proof path is invalid.`);
      requirePositiveInteger(icon.bytes, `${artifact.kind} ${icon.size}px proof bytes`);
      for (const [digest, label] of [[icon.sha256, 'file'], [icon.pixelSha256, 'pixel'], [icon.sourcePixelSha256, 'source pixel']]) requireSha256(digest, `${artifact.kind} ${icon.size}px ${label} digest`);
      if (icon.matchesSource !== true || icon.pixelSha256 !== icon.sourcePixelSha256) fail(`${artifact.kind} ${icon.size}px proof does not match its source-frame pixels.`);
    }
  }
  if (typeof proof.verifiedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(proof.verifiedAt) || Number.isNaN(Date.parse(proof.verifiedAt))) {
    fail('normalized proof verifiedAt must be a UTC ISO-8601 timestamp.');
  }
  return proof;
}

export async function verifyPackagedIconProof(options) {
  const root = path.resolve(options.root ?? defaultRoot);
  const manifestPath = path.resolve(options.manifestPath);
  const proofRoot = path.resolve(options.proofRoot);
  const sourceIconPath = path.resolve(root, options.sourceIconPath ?? SOURCE_ICON);
  const setupExecutablePath = path.resolve(options.setupExecutablePath);
  const applicationExecutablePath = path.resolve(options.applicationExecutablePath);
  const expectedCommit = options.expectedCommit ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (!COMMIT_PATTERN.test(expectedCommit)) fail('expected commit must be a full lowercase Git SHA.');
  const [manifestBytes, sourceIcon, setupExecutable, applicationExecutable, brandProof] = await Promise.all([
    readFile(manifestPath), readFile(sourceIconPath), executableRecord(setupExecutablePath), executableRecord(applicationExecutablePath),
    verifyBrandReleaseIntegrity({ root, networkMode: options.networkMode ?? 'auto' }),
  ]);
  let manifest;
  try { manifest = JSON.parse(manifestBytes.toString('utf8')); } catch { fail('installer manifest is not valid JSON.'); }
  manifest = cloneManifest(manifest);
  if (options.mutation === 'missing-setup') manifest.iconProof = manifest.iconProof?.filter((record) => record.label !== 'setup');
  else if (options.mutation === 'wrong-record-digest' && manifest.iconProof?.[0]) manifest.iconProof[0].sha256 = '0'.repeat(64);
  else if (options.mutation === 'missing-source-commit') delete manifest.sourceCommit;
  else if (options.mutation && !['missing-setup', 'wrong-record-digest', 'missing-source-commit'].includes(options.mutation)) fail(`unknown deliberate mutation ${options.mutation}.`);

  if (!SUPPORTED_MANIFESTS.has(manifest.schemaVersion)) fail(`unsupported installer manifest schema ${manifest.schemaVersion ?? '(missing)'}.`);
  if (!COMMIT_PATTERN.test(manifest.sourceCommit ?? '')) fail('installer manifest sourceCommit must be a full lowercase Git SHA.');
  if (manifest.sourceCommit !== expectedCommit) fail(`installer manifest sourceCommit ${manifest.sourceCommit} does not match expected commit ${expectedCommit}.`);
  if (!Array.isArray(manifest.iconProof) || manifest.iconProof.length !== 4) fail('installer manifest must contain exactly four icon-proof records.');

  if (sha256(sourceIcon) !== brandProof.icon.sha256) fail('the packaged-proof source ICO is not the current generated and package-URL-verified ICO.');

  const sourceInspection = inspectIco(sourceIcon);
  const artifacts = [];
  for (const [kind, executable] of [['setup', setupExecutable], ['application', applicationExecutable]]) {
    const manifestLabel = kind === 'application' ? 'app' : kind;
    const records = manifest.iconProof.filter((record) => record?.label === manifestLabel).sort((left, right) => left.size - right.size);
    if (records.length !== 2 || JSON.stringify(records.map((record) => record.size)) !== JSON.stringify(EXPECTED_SIZES)) {
      fail(`${kind} must have exact 16px and 32px icon-proof records.`);
    }
    const extractedIcons = [];
    for (const record of records) {
      if (record.executable !== executable.name) fail(`${kind} ${record.size}px record names ${record.executable}, expected ${executable.name}.`);
      requirePositiveInteger(record.bytes, `${kind} ${record.size}px manifest bytes`);
      requireSha256(record.sha256, `${kind} ${record.size}px manifest digest`);
      const imagePath = containedPath(proofRoot, record.path);
      const imageBytes = await readFile(imagePath);
      if (imageBytes.length !== record.bytes) fail(`${kind} ${record.size}px PNG byte count differs from the manifest.`);
      const imageSha256 = sha256(imageBytes);
      if (imageSha256 !== record.sha256) fail(`${kind} ${record.size}px PNG digest differs from the manifest.`);
      const decoded = decodePngRgba(imageBytes);
      if (decoded.width !== record.size || decoded.height !== record.size) fail(`${kind} ${record.size}px PNG decoded as ${decoded.width}x${decoded.height}.`);
      const sourcePixels = sourceInspection.pixelsBySize.get(record.size);
      if (!sourcePixels || !decoded.pixels.equals(sourcePixels)) fail(`${kind} ${record.size}px extracted pixels do not match the source ICO frame.`);
      const pixelSha256 = sha256(decoded.pixels);
      extractedIcons.push({
        size: record.size,
        path: record.path,
        bytes: imageBytes.length,
        sha256: imageSha256,
        pixelSha256,
        sourcePixelSha256: sha256(sourcePixels),
        matchesSource: true,
      });
    }
    artifacts.push({ kind, executable, extractedIcons });
  }

  const proof = {
    schemaVersion: 'material-cookie-clicker.packaged-icon-proof.v1',
    sourceCommit: manifest.sourceCommit,
    sourceIcon: {
      path: SOURCE_ICON,
      bytes: sourceIcon.length,
      sha256: sha256(sourceIcon),
      frames: sourceInspection.frames.map((frame) => ({ size: frame.size, pixelSha256: frame.pixelSha256 })),
    },
    artifacts,
    verifiedAt: options.verifiedAt ?? new Date().toISOString(),
  };
  return validateNormalizedPackagedIconProof(proof);
}

function parseArguments(argv) {
  const options = {};
  let output;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--manifest') options.manifestPath = argv[++index];
    else if (argument === '--proof-root') options.proofRoot = argv[++index];
    else if (argument === '--source-icon') options.sourceIconPath = argv[++index];
    else if (argument === '--setup-executable') options.setupExecutablePath = argv[++index];
    else if (argument === '--application-executable') options.applicationExecutablePath = argv[++index];
    else if (argument === '--verified-at') options.verifiedAt = argv[++index];
    else if (argument === '--expected-commit') options.expectedCommit = argv[++index];
    else if (argument === '--network') options.networkMode = argv[++index];
    else if (argument === '--mutate') options.mutation = argv[++index];
    else if (argument === '--output') output = argv[++index];
    else if (argument === '--json') json = true;
    else fail(`unknown argument ${argument}.`);
  }
  for (const [key, flag] of [['manifestPath', '--manifest'], ['proofRoot', '--proof-root'], ['setupExecutablePath', '--setup-executable'], ['applicationExecutablePath', '--application-executable']]) {
    if (!options[key]) fail(`${flag} is required.`);
  }
  return { options, output, json };
}

export async function runPackagedIconProofCli(argv = process.argv.slice(2)) {
  const { options, output, json } = parseArguments(argv);
  const proof = await verifyPackagedIconProof(options);
  const serialized = `${JSON.stringify(proof, null, 2)}\n`;
  if (output) {
    const destination = path.resolve(output);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, serialized, 'utf8');
  }
  if (json || !output) process.stdout.write(serialized);
  else process.stdout.write(`Packaged icon proof verified for ${proof.sourceCommit}: Setup.exe and application at ${EXPECTED_SIZES.join(', ')} px.\n`);
  return proof;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  await runPackagedIconProofCli();
}
