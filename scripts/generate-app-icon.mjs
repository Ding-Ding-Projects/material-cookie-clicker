// Generates assets/material-cookie-clicker.ico: a real multi-resolution Windows ICO (16, 32,
// 48, 256 px), each frame a hand-drawn cookie — a rounded tan disc with
// chocolate-chip dots — encoded as an uncompressed 32bpp BGRA DIB, which is
// the one format every ICO reader (including Explorer's small-icon view)
// is guaranteed to accept without a PNG decoder.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [16, 32, 48, 256];

// Chip centers/radii expressed as fractions of the frame size so the same
// layout scales cleanly from 16px up to 256px.
const CHIPS = [
  { x: 0.34, y: 0.30, r: 0.075 },
  { x: 0.60, y: 0.24, r: 0.06 },
  { x: 0.72, y: 0.46, r: 0.07 },
  { x: 0.48, y: 0.52, r: 0.055 },
  { x: 0.30, y: 0.62, r: 0.065 },
  { x: 0.62, y: 0.70, r: 0.06 },
  { x: 0.42, y: 0.78, r: 0.05 },
];

function renderFrame(size) {
  const xorBytes = size * size * 4;
  const andBytes = Math.ceil(size / 32) * 4 * size;
  const pixels = Buffer.alloc(xorBytes);
  const setPixel = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    // ICO/BMP rows are stored bottom-up.
    const offset = ((size - 1 - y) * size + x) * 4;
    pixels[offset] = b;
    pixels[offset + 1] = g;
    pixels[offset + 2] = r;
    pixels[offset + 3] = a;
  };
  const cx = size / 2;
  const cy = size / 2;
  const cookieRadius = size * 0.47;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > cookieRadius) continue;
      // A warm tan-to-caramel radial gradient for the cookie base.
      const t = dist / cookieRadius;
      const r = Math.round(214 * (1 - t) + 176 * t);
      const g = Math.round(158 * (1 - t) + 114 * t);
      const b = Math.round(97 * (1 - t) + 58 * t);
      setPixel(x, y, r, g, b);
    }
  }
  for (const chip of CHIPS) {
    const chipCx = chip.x * size;
    const chipCy = chip.y * size;
    const chipR = Math.max(1, chip.r * size);
    for (let y = Math.floor(chipCy - chipR); y <= Math.ceil(chipCy + chipR); y += 1) {
      for (let x = Math.floor(chipCx - chipR); x <= Math.ceil(chipCx + chipR); x += 1) {
        if (Math.hypot(x + 0.5 - chipCx, y + 0.5 - chipCy) > chipR) continue;
        // Chips only render where the cookie base itself is opaque.
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > cookieRadius) continue;
        setPixel(x, y, 61, 33, 20);
      }
    }
  }
  const dib = Buffer.alloc(40);
  dib.writeUInt32LE(40, 0);
  dib.writeInt32LE(size, 4);
  dib.writeInt32LE(size * 2, 8); // height doubled: ICO convention (XOR + AND masks)
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  dib.writeUInt32LE(0, 16);
  dib.writeUInt32LE(xorBytes, 20);
  return Buffer.concat([dib, pixels, Buffer.alloc(andBytes)]);
}

const frames = SIZES.map((size) => ({ size, data: renderFrame(size) }));

const iconDir = Buffer.alloc(6);
iconDir.writeUInt16LE(0, 0);
iconDir.writeUInt16LE(1, 2);
iconDir.writeUInt16LE(frames.length, 4);

let offset = 6 + frames.length * 16;
const entries = [];
for (const frame of frames) {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(frame.size >= 256 ? 0 : frame.size, 0);
  entry.writeUInt8(frame.size >= 256 ? 0 : frame.size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(frame.data.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += frame.data.length;
  entries.push(entry);
}

const ico = Buffer.concat([iconDir, ...entries, ...frames.map((frame) => frame.data)]);
await mkdir(path.join(root, 'assets'), { recursive: true });
await writeFile(path.join(root, 'assets', 'material-cookie-clicker.ico'), ico);
process.stdout.write(`Wrote assets/material-cookie-clicker.ico with frames: ${SIZES.join(', ')} px (${ico.length} bytes)\n`);
