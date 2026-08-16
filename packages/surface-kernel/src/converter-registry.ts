/**
 * File-conversion registry.
 *
 * The registry is fail-closed: a source and target pair that nothing is
 * registered for produces a named refusal. It never returns a partial or
 * best-effort result, because a partially converted document is worse than no
 * document at all.
 */

import type { AbortSignalLike } from "./ports.ts";

export type ConversionResult = {
  ok: boolean;
  body?: string;
  reason?: string;
};

export interface ConversionAdapter {
  id: string;
  category: string;
  sourceType: string;
  targetType: string;
  /** True when the adapter ships with the application and needs nothing else. */
  bundled: boolean;
  validate(input: string): { ok: boolean; reason?: string };
  convert(input: string, signal: AbortSignalLike): Promise<ConversionResult>;
}

export class ConverterRegistry {
  readonly #adapters = new Map<string, ConversionAdapter>();

  register(adapter: ConversionAdapter): void {
    if (!adapter.id) throw new Error("A conversion adapter requires an identifier.");
    if (this.#adapters.has(adapter.id)) {
      throw new Error(`The conversion adapter "${adapter.id}" is already registered.`);
    }
    this.#adapters.set(adapter.id, adapter);
  }

  list(): ConversionAdapter[] {
    return [...this.#adapters.values()];
  }

  /** Returns the adapter for a pair, or null when nothing is registered. */
  find(sourceType: string, targetType: string): ConversionAdapter | null {
    return (
      this.list().find(
        (adapter) => adapter.sourceType === sourceType && adapter.targetType === targetType,
      ) ?? null
    );
  }

  listCategories(): string[] {
    return [...new Set(this.list().map((adapter) => adapter.category))].sort();
  }
}

/**
 * Runs a conversion, refusing by name when no adapter exists or when the
 * adapter rejects the input.
 */
export async function convertWithRegistry(
  registry: ConverterRegistry,
  sourceType: string,
  targetType: string,
  input: string,
  signal: AbortSignalLike,
): Promise<ConversionResult> {
  const adapter = registry.find(sourceType, targetType);
  if (!adapter) {
    return { ok: false, reason: `No converter is registered for ${sourceType} to ${targetType}.` };
  }
  const verdict = adapter.validate(input);
  if (!verdict.ok) {
    return { ok: false, reason: verdict.reason ?? `The input was rejected by ${adapter.id}.` };
  }
  if (signal.aborted) {
    return { ok: false, reason: "The conversion was cancelled before it started." };
  }
  return adapter.convert(input, signal);
}
