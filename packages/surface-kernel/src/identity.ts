/**
 * Display name and logo selection.
 *
 * A logo may be one of the shipped marks or a local raster image the person
 * chose. Vector markup is rejected outright: an SVG can carry script and
 * external references, and nothing in this product needs to inline untrusted
 * markup to show a logo.
 */

import type { BinarySource } from "./ports.ts";
import type { Preferences } from "./preferences.ts";

export type LogoSelection = {
  kind: "shipped" | "local";
  /** Identifier of a shipped mark. */
  id?: string;
  /** Inline data URL of a locally chosen raster image. */
  dataUrl?: string;
};

export const MAX_DISPLAY_NAME_LENGTH = 60;
export const MAX_LOGO_BYTES = 262144;
export const ALLOWED_LOGO_TYPES: readonly string[] = ["image/png", "image/jpeg"];

export type LogoVerdict = { ok: true; type: string } | { ok: false; reason: string };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

/**
 * Checks a candidate logo. The declared type must be allowed, the declared
 * length must be within the limit, and the leading bytes must actually match
 * the declared format.
 */
export async function validateLogoUpload(source: BinarySource, declaredType: string): Promise<LogoVerdict> {
  const type = declaredType.trim().toLowerCase();
  if (type === "image/svg+xml" || source.name.toLowerCase().endsWith(".svg")) {
    return { ok: false, reason: "Vector images are not accepted. Choose a PNG or JPEG image." };
  }
  if (!ALLOWED_LOGO_TYPES.includes(type)) {
    return { ok: false, reason: `Choose a ${ALLOWED_LOGO_TYPES.join(" or ")} image.` };
  }
  if (source.byteLength <= 0 || source.byteLength > MAX_LOGO_BYTES) {
    return { ok: false, reason: `Choose an image no larger than ${MAX_LOGO_BYTES / 1024} KB.` };
  }
  const bytes = await source.read();
  if (bytes.byteLength > MAX_LOGO_BYTES) {
    return { ok: false, reason: `Choose an image no larger than ${MAX_LOGO_BYTES / 1024} KB.` };
  }
  const matches = type === "image/png" ? startsWith(bytes, PNG_SIGNATURE) : startsWith(bytes, JPEG_SIGNATURE);
  if (!matches) {
    return { ok: false, reason: "The file contents do not match the declared image format." };
  }
  return { ok: true, type };
}

/** Falls back to the shipped product name when no display name is set. */
export function resolveDisplayName(preferences: Preferences, shippedName: string): string {
  const chosen = preferences.displayName.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
  return chosen.length > 0 ? chosen : shippedName;
}

/** Describes the active logo choice for a settings summary. */
export function describeLogoSelection(selection: LogoSelection): string {
  if (selection.kind === "local") return "A locally chosen image is in use.";
  return selection.id ? `The shipped mark "${selection.id}" is in use.` : "The default shipped mark is in use.";
}
