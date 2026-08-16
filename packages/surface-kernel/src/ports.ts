/**
 * Injection points for everything the kernel deliberately cannot do itself.
 *
 * This package contains no rendering, no filesystem access and no network
 * access. Every surface that consumes it supplies its own implementation of
 * these interfaces: the documentation site over browser storage, the desktop
 * application over its main-process storage.
 */

/** Bounded string-keyed persistence, implemented per surface. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

/** Time source, so schedules, history and locks stay testable. */
export interface Clock {
  now(): number;
  isoNow(): string;
}

/** Identifier source, so records can be produced deterministically in tests. */
export interface IdFactory {
  next(): string;
}

/**
 * Structural stand-in for the standard abort signal. The kernel is compiled
 * without host library types, so it describes the shape it needs; a real
 * `AbortSignal` satisfies it.
 */
export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

/** A named byte source that is read only after its declared length is checked. */
export interface BinarySource {
  name: string;
  byteLength: number;
  read(): Promise<Uint8Array>;
}

/**
 * The subset of the Web Cryptography API the kernel uses. Declaring it here
 * keeps the package free of DOM and Node type dependencies while still being
 * type-checked; the same shape is provided by browsers and by Node 22.
 */
export interface WebCryptoSubtle {
  importKey(
    format: "raw",
    keyData: Uint8Array | ArrayBuffer,
    algorithm: unknown,
    extractable: boolean,
    keyUsages: string[],
  ): Promise<unknown>;
  sign(algorithm: unknown, key: unknown, data: Uint8Array | ArrayBuffer): Promise<ArrayBuffer>;
  deriveBits(algorithm: unknown, key: unknown, length: number): Promise<ArrayBuffer>;
  digest(algorithm: string, data: Uint8Array | ArrayBuffer): Promise<ArrayBuffer>;
}

export interface WebCryptoLike {
  getRandomValues(array: Uint8Array): Uint8Array;
  randomUUID(): string;
  subtle: WebCryptoSubtle;
}

/**
 * Returns the ambient Web Cryptography implementation, or throws a plain
 * message. Nothing in the kernel silently degrades to a weaker substitute.
 */
export function requireWebCrypto(): WebCryptoLike {
  const candidate = (globalThis as { crypto?: WebCryptoLike }).crypto;
  if (!candidate || typeof candidate.getRandomValues !== "function" || !candidate.subtle) {
    throw new Error("A Web Cryptography implementation is required and was not available.");
  }
  return candidate;
}

/** A clock backed by the host runtime. */
export const systemClock: Clock = {
  now: () => Date.now(),
  isoNow: () => new Date().toISOString(),
};

/** An identifier factory backed by the host Web Cryptography implementation. */
export const systemIdFactory: IdFactory = {
  next: () => requireWebCrypto().randomUUID(),
};

/** A fixed clock for tests and previews. */
export function createFixedClock(startMs: number, stepMs = 0): Clock {
  let current = startMs;
  const advance = (): number => {
    const value = current;
    current += stepMs;
    return value;
  };
  return {
    now: advance,
    isoNow: () => new Date(advance()).toISOString(),
  };
}

/** A counting identifier factory for tests and previews. */
export function createSequenceIdFactory(prefix: string, start = 1): IdFactory {
  let counter = start;
  return { next: () => `${prefix}${counter++}` };
}
