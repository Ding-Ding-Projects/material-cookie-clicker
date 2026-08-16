/**
 * Time-based one-time passwords (RFC 4226 and RFC 6238).
 *
 * This is a standards utility only. It is bound to no account in this product,
 * it grants access to nothing, and it performs no network access: it produces
 * and checks codes for an authenticator application a person already uses.
 *
 * Parameters are fixed at HMAC-SHA-1, six digits and a thirty-second period,
 * which is what authenticator applications assume by default.
 */

import { requireWebCrypto } from "./ports.ts";

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_ALGORITHM = "SHA1";
export const DEFAULT_DRIFT_WINDOWS = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 encoding without padding. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31] ?? "";
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31] ?? "";
  return output;
}

/** RFC 4648 base32 decoding; padding and spacing are tolerated. */
export function base32Decode(secret: string): Uint8Array {
  const normalized = secret.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) throw new Error("The shared secret is not valid base32.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(bytes);
}

/** Generates a 160-bit shared secret, matching the SHA-1 block size. */
export function generateTotpSecret(): string {
  return base32Encode(requireWebCrypto().getRandomValues(new Uint8Array(20)));
}

function encodeUriComponentSafe(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Builds the otpauth URI an authenticator application reads from a QR code. */
export function totpUri(input: { issuer: string; account: string; secret: string }): string {
  const label = `${encodeUriComponentSafe(input.issuer)}:${encodeUriComponentSafe(input.account)}`;
  const parameters = [
    `secret=${input.secret.replace(/[\s-]/g, "").toUpperCase()}`,
    `issuer=${encodeUriComponentSafe(input.issuer)}`,
    `algorithm=${TOTP_ALGORITHM}`,
    `digits=${TOTP_DIGITS}`,
    `period=${TOTP_PERIOD_SECONDS}`,
  ];
  return `otpauth://totp/${label}?${parameters.join("&")}`;
}

function counterBytes(counter: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  let remaining = counter;
  for (let index = 7; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

async function hotp(secret: Uint8Array, counter: bigint): Promise<string> {
  const crypto = requireWebCrypto();
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes(counter)));
  const offset = (signature[signature.length - 1] ?? 0) & 0x0f;
  const binary =
    (((signature[offset] ?? 0) & 0x7f) << 24) |
    (((signature[offset + 1] ?? 0) & 0xff) << 16) |
    (((signature[offset + 2] ?? 0) & 0xff) << 8) |
    ((signature[offset + 3] ?? 0) & 0xff);
  return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
}

/** The counter value covering an instant, in milliseconds since the epoch. */
export function totpCounter(atMs: number): bigint {
  return BigInt(Math.floor(atMs / 1000 / TOTP_PERIOD_SECONDS));
}

/** Produces the six-digit code for an instant. */
export function currentTotp(secret: string, atMs: number): Promise<string> {
  return hotp(base32Decode(secret), totpCounter(atMs));
}

function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Checks a code, accepting the given number of periods of clock drift on
 * either side. Comparison is length-constant.
 */
export async function verifyTotp(
  secret: string,
  code: string,
  atMs: number,
  driftWindows: number = DEFAULT_DRIFT_WINDOWS,
): Promise<boolean> {
  const candidate = code.replace(/\s/g, "");
  if (!/^\d+$/.test(candidate) || candidate.length !== TOTP_DIGITS) return false;
  const bytes = base32Decode(secret);
  const centre = totpCounter(atMs);
  const windows = Math.max(0, Math.floor(driftWindows));
  let accepted = false;
  for (let offset = -windows; offset <= windows; offset += 1) {
    const counter = centre + BigInt(offset);
    if (counter < 0n) continue;
    // Every window is evaluated so the check does not finish early.
    if (constantTimeEquals(await hotp(bytes, counter), candidate)) accepted = true;
  }
  return accepted;
}
