import { normalizeBase32Secret } from "./security-totp.js";

export interface Clock {
  now(): number;
  isoNow(): string;
}

export type LockScope = { readonly elementId: string; readonly property?: string };
export type PasswordVerifier = { readonly salt: string; readonly hash: string; readonly failureCount: number };

export type ToyLockMethod = "password" | "totp";
export type ToyLockDuration =
  | { readonly kind: "surface" }
  | { readonly kind: "minutes"; readonly minutes: number }
  | { readonly kind: "until-close" };

export type ToyLock = {
  readonly id: string;
  readonly scope: LockScope;
  readonly method: ToyLockMethod;
  readonly credentialRef: string;
  readonly duration: ToyLockDuration;
  readonly createdAt: string;
  readonly unlockedUntil: string | null;
  readonly unlockedForSession: boolean;
  readonly passwordVerifier: PasswordVerifier | null;
};

export interface CredentialVault {
  put(ref: string, secret: string): Promise<void>;
  read(ref: string): Promise<string | null>;
  delete(ref: string): Promise<void>;
}

export interface TotpVerifier {
  verify(secret: string, code: string, nowMs: number): Promise<boolean>;
}

export const TOY_LOCK_DISCLOSURE = "Element locks only guard against accidental edits in this interface; they are not a security control and they do not protect stored data. Clearing the application's local data resets every lock.";
export const MAX_LOCK_DURATION_MINUTES = 24 * 60;
const PASSWORD_ITERATIONS = 210_000;

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function derivePasswordHash(answer: string, salt: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Web Cryptography is unavailable.");
  const material = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(answer.normalize("NFKC")), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await globalThis.crypto.subtle.deriveBits({ name: "PBKDF2", salt: Uint8Array.from(salt).buffer, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" }, material, 256);
  return bytesToHex(new Uint8Array(bits));
}

async function createPasswordVerifier(answer: string): Promise<PasswordVerifier> {
  if (answer.length < 1 || answer.length > 200) throw new Error("A password must be 1 to 200 characters.");
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return { salt: bytesToHex(salt), hash: await derivePasswordHash(answer, salt), failureCount: 0 };
}

async function verifyPasswordVerifier(verifier: PasswordVerifier, answer: string): Promise<{ ok: boolean; verifier: PasswordVerifier }> {
  const candidate = await derivePasswordHash(answer, hexToBytes(verifier.salt));
  const ok = constantTimeEqual(candidate, verifier.hash);
  return { ok, verifier: ok ? { ...verifier, failureCount: 0 } : { ...verifier, failureCount: verifier.failureCount + 1 } };
}

function normalizeDuration(duration: ToyLockDuration): ToyLockDuration {
  if (duration.kind !== "minutes") return duration;
  if (!Number.isFinite(duration.minutes) || duration.minutes < 1 || duration.minutes > MAX_LOCK_DURATION_MINUTES) {
    throw new Error(`Unlock duration must be 1 to ${MAX_LOCK_DURATION_MINUTES} minutes.`);
  }
  return { kind: "minutes", minutes: Math.floor(duration.minutes) };
}

export async function createToyLock(input: {
  id: string;
  scope: LockScope;
  method: ToyLockMethod;
  credential: string;
  duration: ToyLockDuration;
  vault: CredentialVault;
  clock: Clock;
}): Promise<ToyLock> {
  const duration = normalizeDuration(input.duration);
  const credentialRef = `toy-lock:${input.id}`;
  if (input.method === "totp") {
    const secret = normalizeBase32Secret(input.credential);
    await input.vault.put(credentialRef, secret);
    return {
      id: input.id,
      scope: { ...input.scope },
      method: "totp",
      credentialRef,
      duration,
      createdAt: input.clock.isoNow(),
      unlockedUntil: null,
      unlockedForSession: false,
      passwordVerifier: null,
    };
  }

  const passwordVerifier = await createPasswordVerifier(input.credential);
  await input.vault.put(credentialRef, passwordVerifier.hash);
  return {
    id: input.id,
    scope: { ...input.scope },
    method: "password",
    credentialRef,
    duration,
    createdAt: input.clock.isoNow(),
    unlockedUntil: null,
    unlockedForSession: false,
    passwordVerifier,
  };
}

function unlocked(lock: ToyLock, nowMs: number): boolean {
  return lock.unlockedForSession || (lock.unlockedUntil !== null && Date.parse(lock.unlockedUntil) > nowMs);
}

export function toyLockBlocksMutation(locks: readonly ToyLock[], scope: LockScope, nowMs: number): boolean {
  return locks.some((lock) => {
    if (lock.scope.elementId !== scope.elementId) return false;
    if (lock.scope.property !== undefined && lock.scope.property !== scope.property) return false;
    return !unlocked(lock, nowMs);
  });
}

function applyDuration(lock: ToyLock, nowMs: number): ToyLock {
  if (lock.duration.kind === "until-close") {
    return { ...lock, unlockedUntil: null, unlockedForSession: true };
  }
  const milliseconds = lock.duration.kind === "surface" ? 1 : lock.duration.minutes * 60_000;
  return { ...lock, unlockedUntil: new Date(nowMs + milliseconds).toISOString(), unlockedForSession: false };
}

export async function unlockToyLock(input: {
  lock: ToyLock;
  answer: string;
  vault: CredentialVault;
  totp: TotpVerifier;
  clock: Clock;
}): Promise<{ ok: boolean; lock: ToyLock }> {
  if (input.lock.method === "password") {
    if (!input.lock.passwordVerifier) return { ok: false, lock: input.lock };
    const verdict = await verifyPasswordVerifier(input.lock.passwordVerifier, input.answer);
    return verdict.ok
      ? { ok: true, lock: applyDuration(input.lock, input.clock.now()) }
      : { ok: false, lock: { ...input.lock, passwordVerifier: verdict.verifier } };
  }

  const secret = await input.vault.read(input.lock.credentialRef);
  if (!secret) return { ok: false, lock: input.lock };
  const ok = await input.totp.verify(secret, input.answer, input.clock.now());
  return ok ? { ok: true, lock: applyDuration(input.lock, input.clock.now()) } : { ok: false, lock: input.lock };
}

export function relockToyLock(lock: ToyLock): ToyLock {
  return { ...lock, unlockedUntil: null, unlockedForSession: false };
}

export async function removeToyLock(lock: ToyLock, vault: CredentialVault): Promise<void> {
  await vault.delete(lock.credentialRef);
}
