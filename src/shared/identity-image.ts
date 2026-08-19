import { MAX_LOGO_BYTES, MAX_LOGO_DIMENSION, MAX_LOGO_PIXELS, type IdentityValidation, type LogoMetadata } from "./identity-model.js";

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function startsWith(bytes: Uint8Array, signature: Uint8Array): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)) >>> 0;
}

function validateDimensions(width: number, height: number): string | null {
  if (width < 1 || height < 1) return "The image has no drawable area.";
  if (width > MAX_LOGO_DIMENSION || height > MAX_LOGO_DIMENSION || width * height > MAX_LOGO_PIXELS) {
    return `Decoded images are limited to ${MAX_LOGO_DIMENSION} pixels per side and ${MAX_LOGO_PIXELS} total pixels.`;
  }
  return null;
}

function parsePng(bytes: Uint8Array): IdentityValidation<LogoMetadata> {
  if (bytes.length < 33 || !startsWith(bytes, PNG_SIGNATURE) || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") {
    return { ok: false, reason: "The PNG signature or IHDR header is invalid." };
  }
  const width = u32(bytes, 16);
  const height = u32(bytes, 20);
  const issue = validateDimensions(width, height);
  if (issue) return { ok: false, reason: issue };
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = u32(bytes, offset);
    if (length > bytes.length - offset - 12) return { ok: false, reason: "The PNG chunk table is truncated." };
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (type === "acTL") return { ok: false, reason: "Animated PNG images are not accepted." };
    offset += 12 + length;
  }
  return { ok: true, value: { mimeType: "image/png", width, height, frames: 1, byteLength: bytes.length } };
}

function parseJpeg(bytes: Uint8Array): IdentityValidation<LogoMetadata> {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return { ok: false, reason: "The JPEG signature is invalid." };
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return { ok: false, reason: "The JPEG marker stream is invalid." };
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++] ?? 0;
    if (marker === 0xd9 || marker === 0xda) break;
    const length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (length < 2 || offset + length > bytes.length) return { ok: false, reason: "The JPEG marker stream is truncated." };
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      const height = ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0);
      const width = ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0);
      const issue = validateDimensions(width, height);
      return issue ? { ok: false, reason: issue } : { ok: true, value: { mimeType: "image/jpeg", width, height, frames: 1, byteLength: bytes.length } };
    }
    offset += length;
  }
  return { ok: false, reason: "The JPEG has no supported frame header." };
}

export function inspectLogoBytes(bytes: Uint8Array): IdentityValidation<LogoMetadata> {
  if (bytes.length < 1 || bytes.length > MAX_LOGO_BYTES) return { ok: false, reason: `Choose a logo from 1 byte through ${MAX_LOGO_BYTES} bytes.` };
  if (startsWith(bytes, PNG_SIGNATURE)) return parsePng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return parseJpeg(bytes);
  return { ok: false, reason: "Only PNG and JPEG image bytes are accepted." };
}
