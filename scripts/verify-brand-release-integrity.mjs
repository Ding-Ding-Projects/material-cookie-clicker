#!/usr/bin/env node
/**
 * Fail-closed release-brand proof.
 *
 * The local ICO must be byte-for-byte reproducible from the committed SVG
 * master, its directory and DIB frames must match the canonical size contract,
 * and Squirrel's immutable raw URL must resolve to those same ICO bytes.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND_ICON_SIZES, makeIco, parseMaster } from './generate-app-icon.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), '..');
const ICON_RELATIVE_PATH = 'assets/material-cookie-clicker.ico';
const MASTER_RELATIVE_PATH = 'assets/material-cookie-clicker-logo-master.svg';
const GENERATOR_RELATIVE_PATH = 'scripts/generate-app-icon.mjs';
const RAW_ICON_URL = /^https:\/\/raw\.githubusercontent\.com\/Ding-Ding-Projects\/material-cookie-clicker\/([0-9a-f]{40})\/(assets\/material-cookie-clicker\.ico)$/;

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fail(message) {
  throw new Error(`Brand release integrity failed: ${message}`);
}

function assertInteger(value, label) {
  if (!Number.isInteger(value)) fail(`${label} must be an integer.`);
}

export function validateBrandMaster(svg) {
  if (!/^<\?xml version="1\.0" encoding="UTF-8"\?>\r?\n<svg\b/m.test(svg)) fail('the SVG master must declare UTF-8 XML and an svg root.');
  if (!/<svg\b[^>]*\bviewBox="0 0 512 512"[^>]*\brole="img"[^>]*\baria-labelledby="title description"[^>]*>/m.test(svg)) {
    fail('the SVG master must expose the canonical 512px accessible viewBox.');
  }
  if (!/<title id="title">[^<]+<\/title>/.test(svg) || !/<desc id="description">[^<]+<\/desc>/.test(svg)) {
    fail('the SVG master must contain its accessible title and description.');
  }
  if (/<(?:script|image|foreignObject)\b/i.test(svg) || /(?:href|src)\s*=\s*["'](?:https?:|data:|file:|\/\/)/i.test(svg) || /<!DOCTYPE|<!ENTITY/i.test(svg)) {
    fail('the SVG master must be local, declarative, and free of scripts, embedded documents, external references, doctypes, and entities.');
  }
  return parseMaster(svg);
}

function decodeDibFrame(icon, entry, size) {
  const { bytes, offset } = entry;
  if (offset + bytes > icon.length) fail(`${size}px ICO frame extends past the container.`);
  const frame = icon.subarray(offset, offset + bytes);
  if (frame.length < 40) fail(`${size}px ICO frame is shorter than its DIB header.`);
  if (frame.readUInt32LE(0) !== 40) fail(`${size}px ICO frame must use a 40-byte BITMAPINFOHEADER.`);
  if (frame.readInt32LE(4) !== size || frame.readInt32LE(8) !== size * 2) fail(`${size}px ICO DIB dimensions do not match its directory entry.`);
  if (frame.readUInt16LE(12) !== 1 || frame.readUInt16LE(14) !== 32) fail(`${size}px ICO frame must be one-plane 32-bit BGRA.`);
  if (frame.readUInt32LE(16) !== 0) fail(`${size}px ICO frame must be uncompressed BI_RGB.`);

  const xorBytes = size * size * 4;
  const maskRowBytes = Math.ceil(size / 32) * 4;
  const maskBytes = maskRowBytes * size;
  const expectedBytes = 40 + xorBytes + maskBytes;
  if (bytes !== expectedBytes || frame.length !== expectedBytes) fail(`${size}px ICO frame has ${bytes} bytes; expected exactly ${expectedBytes}.`);
  if (frame.readUInt32LE(20) !== xorBytes) fail(`${size}px ICO DIB image-size field must be exactly ${xorBytes}.`);
  if (frame.subarray(40 + xorBytes).some((value) => value !== 0)) fail(`${size}px ICO AND mask must remain empty because alpha owns transparency.`);

  const pixels = Buffer.alloc(xorBytes);
  let alphaMin = 255;
  let alphaMax = 0;
  let nonTransparentPixels = 0;
  const colors = new Set();
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const source = 40 + ((size - 1 - y) * size + x) * 4;
      const target = (y * size + x) * 4;
      const blue = frame[source];
      const green = frame[source + 1];
      const red = frame[source + 2];
      const alpha = frame[source + 3];
      pixels[target] = red;
      pixels[target + 1] = green;
      pixels[target + 2] = blue;
      pixels[target + 3] = alpha;
      alphaMin = Math.min(alphaMin, alpha);
      alphaMax = Math.max(alphaMax, alpha);
      if (alpha > 0) {
        nonTransparentPixels += 1;
        colors.add(`${red},${green},${blue}`);
      }
    }
  }
  if (alphaMin !== 0 || alphaMax !== 255) fail(`${size}px ICO frame must contain both transparent and opaque pixels.`);
  if (nonTransparentPixels === 0 || colors.size < 3) fail(`${size}px ICO frame is blank or monochrome.`);

  return {
    pixels,
    proof: {
      size,
      width: size,
      height: size,
      planes: 1,
      bitDepth: 32,
      encoding: 'DIB-BGRA32',
      offset,
      bytes,
      sha256: sha256(frame),
      pixelSha256: sha256(pixels),
      alphaRange: [alphaMin, alphaMax],
      nonTransparentPixels,
    },
  };
}

export function inspectIco(icon, expectedSizes = BRAND_ICON_SIZES) {
  if (!Buffer.isBuffer(icon)) icon = Buffer.from(icon);
  if (icon.length < 6) fail('the ICO container is shorter than its header.');
  if (icon.readUInt16LE(0) !== 0 || icon.readUInt16LE(2) !== 1) fail('the ICO header must be reserved=0 and type=1.');
  const count = icon.readUInt16LE(4);
  if (count !== expectedSizes.length) fail(`the ICO contains ${count} frames; expected exactly ${expectedSizes.length}.`);
  if (icon.length < 6 + count * 16) fail('the ICO directory is truncated.');

  const frames = [];
  const pixelsBySize = new Map();
  let expectedOffset = 6 + count * 16;
  const seen = new Set();
  for (let index = 0; index < count; index += 1) {
    const directoryOffset = 6 + index * 16;
    const width = icon[directoryOffset] || 256;
    const height = icon[directoryOffset + 1] || 256;
    const colorCount = icon[directoryOffset + 2];
    const reserved = icon[directoryOffset + 3];
    const planes = icon.readUInt16LE(directoryOffset + 4);
    const bitDepth = icon.readUInt16LE(directoryOffset + 6);
    const bytes = icon.readUInt32LE(directoryOffset + 8);
    const offset = icon.readUInt32LE(directoryOffset + 12);
    const expectedSize = expectedSizes[index];
    for (const [value, label] of [[width, 'width'], [height, 'height'], [planes, 'planes'], [bitDepth, 'bit depth'], [bytes, 'byte count'], [offset, 'offset']]) {
      assertInteger(value, `${expectedSize}px directory ${label}`);
    }
    if (width !== expectedSize || height !== expectedSize) fail(`ICO directory entry ${index} is ${width}x${height}; expected ${expectedSize}x${expectedSize}.`);
    if (seen.has(width)) fail(`the ICO contains a duplicate ${width}px directory entry.`);
    seen.add(width);
    if (colorCount !== 0 || reserved !== 0 || planes !== 1 || bitDepth !== 32) fail(`${expectedSize}px ICO directory fields are not canonical 32-bit true-color values.`);
    if (offset !== expectedOffset) fail(`${expectedSize}px ICO frame begins at ${offset}; expected contiguous offset ${expectedOffset}.`);
    const decoded = decodeDibFrame(icon, { bytes, offset }, expectedSize);
    frames.push(decoded.proof);
    pixelsBySize.set(expectedSize, decoded.pixels);
    expectedOffset += bytes;
  }
  if (expectedOffset !== icon.length) fail(`the ICO has ${icon.length - expectedOffset} unexpected trailing bytes.`);
  return { frames, pixelsBySize };
}

export function parsePackageIconUrl(iconUrl) {
  let parsed;
  try { parsed = new URL(iconUrl); } catch { fail('Squirrel iconUrl is not a valid URL.'); }
  if (parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) fail('Squirrel iconUrl must not carry credentials, a port, query parameters, or a fragment.');
  const match = iconUrl.match(RAW_ICON_URL);
  if (!match) fail('Squirrel iconUrl must be an immutable full-commit raw URL for assets/material-cookie-clicker.ico.');
  return { url: iconUrl, commit: match[1], path: match[2] };
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function resolvePinnedIconBytes(root, descriptor, localIcon, networkMode, fetchImpl) {
  const localBlob = git(root, ['hash-object', path.join(root, ICON_RELATIVE_PATH)]);
  let pinnedBlob;
  if (networkMode !== 'https') {
    try {
      pinnedBlob = git(root, ['rev-parse', `${descriptor.commit}:${descriptor.path}`]);
    } catch {
      if (networkMode === 'local') fail(`the pinned icon commit ${descriptor.commit} is unavailable locally and network fallback is disabled.`);
    }
  }
  if (pinnedBlob) {
    if (pinnedBlob !== localBlob) fail(`Squirrel iconUrl resolves to Git blob ${pinnedBlob}, but the current generated ICO is ${localBlob}.`);
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', descriptor.commit, 'HEAD'], { cwd: root, stdio: 'ignore' });
    } catch {
      fail(`Squirrel iconUrl commit ${descriptor.commit} is not an ancestor of the current source commit.`);
    }
    return { source: 'local-git', gitBlobSha1: pinnedBlob, sha256: sha256(localIcon) };
  }

  if (typeof fetchImpl !== 'function') fail('the pinned icon commit is unavailable locally and HTTPS verification cannot run.');
  const response = await fetchImpl(descriptor.url, { redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { accept: 'image/x-icon,application/octet-stream' } });
  if (!response.ok) fail(`the immutable icon URL returned HTTP ${response.status}.`);
  const remoteBytes = Buffer.from(await response.arrayBuffer());
  if (!remoteBytes.equals(localIcon)) fail(`the immutable icon URL serves SHA-256 ${sha256(remoteBytes)}, but the current generated ICO is ${sha256(localIcon)}.`);
  return { source: 'https', gitBlobSha1: localBlob, sha256: sha256(remoteBytes) };
}

export async function verifyBrandReleaseIntegrity(options = {}) {
  const root = path.resolve(options.root ?? defaultRoot);
  const masterPath = path.resolve(root, options.masterPath ?? MASTER_RELATIVE_PATH);
  const iconPath = path.resolve(root, options.iconPath ?? ICON_RELATIVE_PATH);
  const packagePath = path.resolve(root, options.packagePath ?? 'package.json');
  const generatorPath = path.resolve(root, GENERATOR_RELATIVE_PATH);
  const networkMode = options.networkMode ?? 'auto';
  if (!['auto', 'local', 'https'].includes(networkMode)) fail(`unknown network mode ${networkMode}.`);

  const [svgBytes, iconOnDisk, packageBytes, generatorBytes] = await Promise.all([
    readFile(masterPath), readFile(iconPath), readFile(packagePath), readFile(generatorPath),
  ]);
  const svg = svgBytes.toString('utf8');
  const geometry = validateBrandMaster(svg);
  const generatedIcon = makeIco(geometry);
  let icon = Buffer.from(iconOnDisk);
  let packageJson;
  try { packageJson = JSON.parse(packageBytes.toString('utf8')); } catch { fail('package.json is not valid JSON.'); }

  if (options.mutation === 'generated-byte') icon[icon.length - 1] ^= 0xff;
  if (options.mutation === 'missing-frame') icon.writeUInt16LE(BRAND_ICON_SIZES.length - 1, 4);
  if (options.mutation === 'stale-url') {
    packageJson.build.squirrelWindows.iconUrl = 'https://raw.githubusercontent.com/Ding-Ding-Projects/material-cookie-clicker/a98e38c07423a7cfb4cb3190412884a404a7245e/assets/material-cookie-clicker.ico';
  }
  if (options.mutation && !['generated-byte', 'missing-frame', 'stale-url'].includes(options.mutation)) fail(`unknown deliberate mutation ${options.mutation}.`);

  if (!icon.equals(generatedIcon)) fail(`assets/material-cookie-clicker.ico is not the exact output of ${MASTER_RELATIVE_PATH}.`);
  const inspected = inspectIco(icon);
  const descriptor = parsePackageIconUrl(packageJson?.build?.squirrelWindows?.iconUrl);
  const pinned = await resolvePinnedIconBytes(root, descriptor, icon, networkMode, options.fetchImpl ?? globalThis.fetch);

  if (packageJson?.build?.icon !== ICON_RELATIVE_PATH || packageJson?.build?.win?.icon !== ICON_RELATIVE_PATH) {
    fail('both build.icon and build.win.icon must reference the verified current ICO.');
  }

  return {
    schemaVersion: 'material-cookie-clicker.brand-release.v1',
    master: {
      path: MASTER_RELATIVE_PATH,
      bytes: svgBytes.length,
      sha256: sha256(svgBytes),
    },
    generator: {
      path: GENERATOR_RELATIVE_PATH,
      bytes: generatorBytes.length,
      sha256: sha256(generatorBytes),
      iconSizes: [...BRAND_ICON_SIZES],
    },
    icon: {
      path: ICON_RELATIVE_PATH,
      bytes: icon.length,
      sha256: sha256(icon),
      gitBlobSha1: pinned.gitBlobSha1,
      frames: inspected.frames,
    },
    packageIconUrl: {
      ...descriptor,
      verificationSource: pinned.source,
      sha256: pinned.sha256,
      matchesCurrentIcon: true,
    },
  };
}

function parseArguments(argv) {
  const options = {};
  let json = false;
  let output;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') json = true;
    else if (argument === '--output') output = argv[++index];
    else if (argument === '--network') options.networkMode = argv[++index];
    else if (argument === '--mutate') options.mutation = argv[++index];
    else fail(`unknown argument ${argument}.`);
  }
  if (output === undefined && argv.includes('--output')) fail('--output needs a path.');
  return { options, json, output };
}

export async function runBrandReleaseIntegrityCli(argv = process.argv.slice(2)) {
  const { options, json, output } = parseArguments(argv);
  const proof = await verifyBrandReleaseIntegrity(options);
  const serialized = `${JSON.stringify(proof, null, 2)}\n`;
  if (output) {
    const destination = path.resolve(output);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, serialized, 'utf8');
  }
  if (json) process.stdout.write(serialized);
  else process.stdout.write(`Brand release integrity verified: ${proof.icon.sha256}; ICO ${proof.generator.iconSizes.join(', ')} px; immutable URL commit ${proof.packageIconUrl.commit}.\n`);
  return proof;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  await runBrandReleaseIntegrityCli();
}
