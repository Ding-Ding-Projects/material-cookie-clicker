/**
 * Presentation locks.
 *
 * A person can lock an element or one of its appearance properties behind a
 * question only they know the answer to, so an accidental edit is harder to
 * make. The answer is never stored: only a salted PBKDF2-SHA-256 verifier is
 * kept, and comparison is length-constant.
 *
 * Read `LOCK_DISCLOSURE` before describing this feature anywhere. It is an
 * interface guard, not a security control.
 */

import { requireWebCrypto, systemClock, type Clock } from "./ports.ts";

export const LOCK_DISCLOSURE =
  "Element locks only guard against accidental edits in this interface; they are not a security control and they do not protect stored data.";

export const LOCK_ITERATIONS = 210_000;
export const LOCK_SALT_BYTES = 16;
export const LOCK_HASH_BYTES = 32;
/** How long a correct answer keeps the element editable. */
export const LOCK_GRACE_MS = 5 * 60 * 1000;
export const MAX_LOCK_ANSWER_LENGTH = 200;
export const MAX_LOCK_HINT_LENGTH = 120;

export type LockScope = {
  elementId: string;
  property?: string;
};

export type LockRecord = {
  id: string;
  scope: LockScope;
  verifierSalt: string;
  verifierHash: string;
  hint: string;
  lockedAt: string;
  unlockedUntil: string | null;
  failureCount: number;
};

/** UTF-8 encoding without relying on a host text-encoder global. */
function utf8Bytes(value: string): Uint8Array {
  const codes: number[] = [];
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x80) codes.push(code);
    else if (code < 0x800) codes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) {
      codes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      codes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(codes);
}

function toHex(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) output += byte.toString(16).padStart(2, "0");
  return output;
}

function fromHex(value: string): Uint8Array {
  const bytes = new Uint8Array(Math.floor(value.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function deriveVerifier(answer: string, salt: Uint8Array): Promise<string> {
  const crypto = requireWebCrypto();
  const material = await crypto.subtle.importKey(
    "raw",
    utf8Bytes(answer.normalize("NFKC")),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: LOCK_ITERATIONS, hash: "SHA-256" },
    material,
    LOCK_HASH_BYTES * 8,
  );
  return toHex(new Uint8Array(bits));
}

/** Creates a lock record. The answer is used once and never stored. */
export async function createLock(
  scope: LockScope,
  answer: string,
  hint: string,
  clock: Clock,
): Promise<LockRecord> {
  if (answer.length < 1 || answer.length > MAX_LOCK_ANSWER_LENGTH) {
    throw new Error(`An unlock answer must be 1 to ${MAX_LOCK_ANSWER_LENGTH} characters.`);
  }
  const crypto = requireWebCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(LOCK_SALT_BYTES));
  const verifierHash = await deriveVerifier(answer, salt);
  return {
    id: crypto.randomUUID(),
    scope: scope.property === undefined ? { elementId: scope.elementId } : { ...scope },
    verifierSalt: toHex(salt),
    verifierHash,
    hint: hint.slice(0, MAX_LOCK_HINT_LENGTH),
    lockedAt: clock.isoNow(),
    unlockedUntil: null,
    failureCount: 0,
  };
}

/**
 * Checks an answer and returns the updated record. A correct answer opens a
 * grace period; an incorrect one increments the failure count. The record is
 * never mutated in place.
 */
export async function verifyLock(
  record: LockRecord,
  answer: string,
  clock: Clock,
): Promise<{ ok: boolean; record: LockRecord }> {
  const candidate = await deriveVerifier(answer, fromHex(record.verifierSalt));
  if (!constantTimeEquals(candidate, record.verifierHash)) {
    return { ok: false, record: { ...record, failureCount: record.failureCount + 1 } };
  }
  return {
    ok: true,
    record: {
      ...record,
      failureCount: 0,
      unlockedUntil: new Date(clock.now() + LOCK_GRACE_MS).toISOString(),
    },
  };
}

/** Returns the moment the current grace period ends, or null when locked. */
export function lockExpiry(record: LockRecord, clock: Clock = systemClock): string | null {
  if (!record.unlockedUntil) return null;
  return Date.parse(record.unlockedUntil) > clock.now() ? record.unlockedUntil : null;
}

/** Whether a change to the given scope is currently blocked. */
export function isMutationBlocked(
  locks: readonly LockRecord[],
  scope: LockScope,
  clock: Clock = systemClock,
): boolean {
  return locks.some((record) => {
    if (record.scope.elementId !== scope.elementId) return false;
    if (record.scope.property !== undefined && record.scope.property !== scope.property) return false;
    return lockExpiry(record, clock) === null;
  });
}
