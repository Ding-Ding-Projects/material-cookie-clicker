/**
 * Read-aloud queue.
 *
 * The kernel owns the ordering and the one-at-a-time rule; the surface owns
 * the actual speech implementation through `NarrationHost`. Bilingual copy is
 * always spoken English first, then Cantonese, so the two never overlap.
 */

export type VoiceDescriptor = {
  id: string;
  label: string;
  lang: string;
};

export type NarrationPreferences = {
  enabled: boolean;
  englishVoiceId: string | null;
  cantoneseVoiceId: string | null;
  rate: number;
  pitch: number;
};

export type NarrationSegment = {
  text: string;
  voiceId: string | null;
  rate: number;
  pitch: number;
};

export interface NarrationHost {
  listVoices(): VoiceDescriptor[];
  speak(text: string, voiceId: string | null, rate: number, pitch: number, onEnd: () => void): void;
  cancel(): void;
}

/**
 * Field kinds that are never read aloud, because speaking them can disclose
 * them to anyone within earshot.
 */
export const NARRATION_EXCLUSIONS: readonly string[] = [
  "identifier",
  "account-number",
  "mailing-address",
  "attachment-name",
  "unlock-answer",
];

/** Whether a field kind may be narrated at all. */
export function mayNarrate(fieldKind: string): boolean {
  return !NARRATION_EXCLUSIONS.includes(fieldKind);
}

/** Builds the ordered English-then-Cantonese segments for one utterance. */
export function bilingualSegments(
  en: string,
  zh: string,
  preferences: NarrationPreferences,
): NarrationSegment[] {
  const segments: NarrationSegment[] = [];
  if (en.trim().length > 0) {
    segments.push({ text: en, voiceId: preferences.englishVoiceId, rate: preferences.rate, pitch: preferences.pitch });
  }
  if (zh.trim().length > 0) {
    segments.push({ text: zh, voiceId: preferences.cantoneseVoiceId, rate: preferences.rate, pitch: preferences.pitch });
  }
  return segments;
}

/** Serializes narration so exactly one utterance is ever in flight. */
export class NarrationQueue {
  readonly #host: NarrationHost;
  readonly #pending: NarrationSegment[] = [];
  #speaking = false;

  constructor(host: NarrationHost) {
    this.#host = host;
  }

  get pendingCount(): number {
    return this.#pending.length;
  }

  get speaking(): boolean {
    return this.#speaking;
  }

  /** Appends segments in order; playback starts when nothing is in flight. */
  enqueue(segments: readonly NarrationSegment[]): void {
    for (const segment of segments) {
      if (segment.text.trim().length > 0) this.#pending.push(segment);
    }
    this.#drain();
  }

  /** Stops the current utterance and discards everything still queued. */
  cancel(): void {
    this.#pending.length = 0;
    this.#speaking = false;
    this.#host.cancel();
  }

  #drain(): void {
    if (this.#speaking) return;
    const next = this.#pending.shift();
    if (!next) return;
    this.#speaking = true;
    this.#host.speak(next.text, next.voiceId, next.rate, next.pitch, () => {
      this.#speaking = false;
      this.#drain();
    });
  }
}
