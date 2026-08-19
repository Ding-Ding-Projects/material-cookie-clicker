import type { OllamaSuiteActions, OllamaSuiteState } from './ollama-suite-types.js';

/**
 * Product-owned boundary between the application shell and the vendored local
 * Ollama engine. The controller remains in the privileged process; renderers
 * receive snapshots and invoke this deliberately narrow action surface.
 *
 * The boundary contains no arbitrary command, URL, executable path, request
 * body, environment map, or secret-bearing value. Catalog refresh is the only
 * non-loopback operation and is implemented by the vendored engine against the
 * allowlisted official catalog origin.
 */
export interface MaterialCookieClickerOllamaSuiteService extends OllamaSuiteActions {
  initialize(): Promise<void>;
  dispose(): void;
}

export interface MaterialCookieClickerOllamaSuiteSnapshot {
  readonly state: OllamaSuiteState;
  readonly capturedAt: string;
}

/** A serializable result shape suitable for a future preload/IPC adapter. */
export type OllamaSuiteResult<T = void> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

export function ollamaSuiteSuccess<T>(value: T): OllamaSuiteResult<T> {
  return { ok: true, value };
}

export function ollamaSuiteFailure(error: unknown): OllamaSuiteResult<never> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : 'The local Ollama operation failed.',
  };
}
