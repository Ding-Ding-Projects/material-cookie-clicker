/**
 * Generate every installed/public brand derivative from the committed SVG master.
 *
 * Outputs:
 *   - assets/material-cookie-clicker.ico (16, 32, 48 and 256 px BGRA frames)
 *   - social-preview.png (1280x640 Open Graph image)
 *
 * `--check` is intentionally read-only and fails when either derivative is stale.
 */
import { deflateSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const masterPath = path.join(root, 'assets', 'material-cookie-clicker-logo-master.svg');
const iconPath = path.join(root, 'assets', 'material-cookie-clicker.ico');
const socialPath = path.join(root, 'social-preview.png');
const SIZES = [16, 32, 48, 256];

function parseMaster(svg) {
  const match = svg.match(/<metadata id="material-cookie-clicker-logo-geometry">([^<]+)<\/metadata>/);
  if (!match) throw new Error('The SVG master is missing its bounded logo geometry metadata.');
  const geometry = JSON.parse(match[1]);
  if (geometry.canvas !== 512 || !Array.isArray(geometry.chips) || geometry.chips.length !== 7) {
    throw new Error('The SVG master geometry must describe the 512px seven-chip project mark.');
  }
  for (const color of [geometry.cookie.inner, geometry.cookie.outer, geometry.cookie.rim]) {
    if (!Array.isArray(color) || color.length !== 3 || color.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
      throw new Error('The SVG master contains an invalid RGB color.');
    }
  }
  return geometry;
}

function createPixels(width, height, fill = [0, 0, 0, 0]) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = fill[0];
    pixels[offset + 1] = fill[1];
    pixels[offset + 2] = fill[2];
    pixels[offset + 3] = fill[3];
  }
  return pixels;
}

function setPixel(pixels, width, height, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = (y * width + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3] ?? 255;
}

function blendChannel(inner, outer, t) {
  return Math.round(inner * (1 - t) + outer * t);
}

function renderLogo(size, geometry) {
  const pixels = createPixels(size, size);
  const scale = size / geometry.canvas;
  const cx = geometry.cookie.cx * scale;
  const cy = geometry.cookie.cy * scale;
  const radius = geometry.cookie.radius * scale;
  const rimWidth = Math.max(1, 14 * scale);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (distance > radius) continue;
      if (distance > radius - rimWidth) {
        setPixel(pixels, size, size, x, y, [...geometry.cookie.rim, 255]);
        continue;
      }
      const t = Math.min(1, distance / Math.max(1, radius - rimWidth));
      const color = geometry.cookie.inner.map((inner, index) => blendChannel(inner, geometry.cookie.outer[index], t));
      setPixel(pixels, size, size, x, y, [...color, 255]);
    }
  }
  for (const [sourceX, sourceY, sourceRadius] of geometry.chips) {
    const chipX = sourceX * scale;
    const chipY = sourceY * scale;
    const chipRadius = Math.max(1, sourceRadius * scale);
    for (let y = Math.floor(chipY - chipRadius); y <= Math.ceil(chipY + chipRadius); y += 1) {
      for (let x = Math.floor(chipX - chipRadius); x <= Math.ceil(chipX + chipRadius); x += 1) {
        if (Math.hypot(x + 0.5 - chipX, y + 0.5 - chipY) <= chipRadius) {
          setPixel(pixels, size, size, x, y, [61, 33, 20, 255]);
        }
      }
    }
  }
  return pixels;
}

function renderIcoFrame(size, geometry) {
  const rgba = renderLogo(size, geometry);
  const xorBytes = size * size * 4;
  const andBytes = Math.ceil(size / 32) * 4 * size;
  const bgraBottomUp = Buffer.alloc(xorBytes);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const source = (y * size + x) * 4;
      const target = ((size - 1 - y) * size + x) * 4;
      bgraBottomUp[target] = rgba[source + 2];
      bgraBottomUp[target + 1] = rgba[source + 1];
      bgraBottomUp[target + 2] = rgba[source];
      bgraBottomUp[target + 3] = rgba[source + 3];
    }
  }
  const dib = Buffer.alloc(40);
  dib.writeUInt32LE(40, 0);
  dib.writeInt32LE(size, 4);
  dib.writeInt32LE(size * 2, 8);
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  dib.writeUInt32LE(0, 16);
  dib.writeUInt32LE(xorBytes, 20);
  return Buffer.concat([dib, bgraBottomUp, Buffer.alloc(andBytes)]);
}

function makeIco(geometry) {
  const frames = SIZES.map((size) => ({ size, data: renderIcoFrame(size, geometry) }));
  const directory = Buffer.alloc(6);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(frames.length, 4);
  let offset = 6 + frames.length * 16;
  const entries = frames.map((frame) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(frame.size >= 256 ? 0 : frame.size, 0);
    entry.writeUInt8(frame.size >= 256 ? 0 : frame.size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(frame.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += frame.data.length;
    return entry;
  });
  return Buffer.concat([directory, ...entries, ...frames.map((frame) => frame.data)]);
}

function fillRect(pixels, width, height, x, y, rectWidth, rectHeight, color) {
  for (let py = Math.max(0, y); py < Math.min(height, y + rectHeight); py += 1) {
    for (let px = Math.max(0, x); px < Math.min(width, x + rectWidth); px += 1) {
      setPixel(pixels, width, height, px, py, color);
    }
  }
}

function blit(source, sourceWidth, sourceHeight, target, targetWidth, targetHeight, targetX, targetY) {
  for (let y = 0; y < sourceHeight; y += 1) {
    for (let x = 0; x < sourceWidth; x += 1) {
      const sourceOffset = (y * sourceWidth + x) * 4;
      if (source[sourceOffset + 3] === 0) continue;
      setPixel(target, targetWidth, targetHeight, targetX + x, targetY + y, [
        source[sourceOffset], source[sourceOffset + 1], source[sourceOffset + 2], source[sourceOffset + 3],
      ]);
    }
  }
}

const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
};

function drawText(pixels, width, height, text, x, y, scale, color) {
  let cursor = x;
  for (const character of text) {
    if (character === ' ') {
      cursor += scale * 4;
      continue;
    }
    const glyph = FONT[character];
    if (!glyph) throw new Error(`The social-preview font does not define ${character}.`);
    glyph.forEach((row, rowIndex) => {
      [...row].forEach((cell, columnIndex) => {
        if (cell === '1') fillRect(pixels, width, height, cursor + columnIndex * scale, y + rowIndex * scale, scale, scale, color);
      });
    });
    cursor += scale * 6;
  }
}

function makeSocialPreview(geometry) {
  const width = 1280;
  const height = 640;
  const pixels = createPixels(width, height, [248, 230, 196, 255]);
  for (let y = 0; y < height; y += 1) {
    const t = y / (height - 1);
    fillRect(pixels, width, height, 0, y, width, 1, [
      blendChannel(255, 223, t), blendChannel(241, 194, t), blendChannel(211, 137, t), 255,
    ]);
  }
  fillRect(pixels, width, height, 0, 0, width, 28, [91, 67, 37, 255]);
  fillRect(pixels, width, height, 0, height - 28, width, 28, [91, 67, 37, 255]);
  fillRect(pixels, width, height, 32, 32, 18, height - 64, [137, 100, 55, 255]);
  const logo = renderLogo(460, geometry);
  blit(logo, 460, 460, pixels, width, height, 74, 90);
  fillRect(pixels, width, height, 590, 104, 630, 104, [255, 249, 239, 255]);
  fillRect(pixels, width, height, 590, 104, 14, 104, [91, 81, 0, 255]);
  drawText(pixels, width, height, 'MATERIAL', 638, 126, 11, [61, 45, 30, 255]);
  drawText(pixels, width, height, 'COOKIE CLICKER', 638, 252, 7, [61, 45, 30, 255]);
  fillRect(pixels, width, height, 590, 364, 630, 128, [255, 249, 239, 255]);
  fillRect(pixels, width, height, 620, 392, 210, 72, [91, 81, 0, 255]);
  fillRect(pixels, width, height, 852, 392, 150, 72, [181, 125, 52, 255]);
  fillRect(pixels, width, height, 1024, 392, 166, 72, [104, 70, 34, 255]);
  drawText(pixels, width, height, 'ENDLESS', 742, 526, 7, [61, 45, 30, 255]);
  return encodePng(width, height, pixels);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return output;
}

function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]), pixels.subarray(y * width * 4, (y + 1) * width * 4));
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function assertCurrent(filePath, expected, label) {
  let actual;
  try { actual = await readFile(filePath); } catch { throw new Error(`${label} is missing; run node scripts/generate-app-icon.mjs --write.`); }
  if (!actual.equals(expected)) throw new Error(`${label} is stale; run node scripts/generate-app-icon.mjs --write.`);
}

const svg = await readFile(masterPath, 'utf8');
const geometry = parseMaster(svg);
const icon = makeIco(geometry);
const social = makeSocialPreview(geometry);
const mode = process.argv[2] ?? '--write';
if (mode === '--check') {
  await assertCurrent(iconPath, icon, 'assets/material-cookie-clicker.ico');
  await assertCurrent(socialPath, social, 'social-preview.png');
  process.stdout.write(`Brand derivatives are current: ICO ${SIZES.join(', ')} px; social preview 1280x640.\n`);
} else if (mode === '--write') {
  await mkdir(path.dirname(iconPath), { recursive: true });
  await writeFile(iconPath, icon);
  await writeFile(socialPath, social);
  process.stdout.write(`Wrote assets/material-cookie-clicker.ico (${icon.length} bytes) and social-preview.png (${social.length} bytes).\n`);
} else {
  throw new Error(`Unknown mode ${mode}; use --write or --check.`);
}
