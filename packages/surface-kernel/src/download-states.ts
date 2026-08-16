/**
 * Transfer state machine for the Start, Downloading, Complete and Failed
 * surfaces.
 *
 * Two properties are structural rather than conventional:
 *
 *   - the reducer cannot enter the complete phase without a measured byte
 *     count, so a surface can never announce a finished transfer it did not
 *     actually measure; and
 *   - `unsigned` is the literal `true`, so no code path can express a
 *     signature-authenticity claim about an artifact.
 */

export type DownloadPhase = "start" | "downloading" | "complete" | "failed";

export type DownloadState = {
  phase: DownloadPhase;
  assetName: string;
  version: string;
  byteTotal: number | null;
  byteCount: number;
  publishedHash: string | null;
  measuredHash: string | null;
  unsigned: true;
  reason: string | null;
};

export type DownloadEvent =
  | { type: "begin"; byteTotal: number | null }
  | { type: "progress"; byteCount: number }
  | { type: "finish"; byteCount: number; measuredHash: string | null }
  | { type: "fail"; reason: string }
  | { type: "reset" };

/**
 * The label a surface shows when the release manifest lists no assets. It is
 * deliberately not a phase of this machine: with nothing published there is no
 * transfer to describe.
 */
export const EMPTY_MANIFEST_PHASE = "unavailable";

/** Builds the initial state for one asset. */
export function createDownloadState(input: {
  assetName: string;
  version: string;
  publishedHash?: string | null;
}): DownloadState {
  return {
    phase: "start",
    assetName: input.assetName,
    version: input.version,
    byteTotal: null,
    byteCount: 0,
    publishedHash: input.publishedHash ?? null,
    measuredHash: null,
    unsigned: true,
    reason: null,
  };
}

function failed(state: DownloadState, reason: string): DownloadState {
  return { ...state, phase: "failed", reason };
}

/** Pure transition function. Unreachable transitions leave the state alone. */
export function reduceDownloadState(state: DownloadState, event: DownloadEvent): DownloadState {
  switch (event.type) {
    case "begin":
      if (state.phase !== "start" && state.phase !== "failed") return state;
      return {
        ...state,
        phase: "downloading",
        byteTotal: event.byteTotal !== null && event.byteTotal > 0 ? event.byteTotal : null,
        byteCount: 0,
        measuredHash: null,
        reason: null,
      };
    case "progress": {
      if (state.phase !== "downloading") return state;
      if (!Number.isFinite(event.byteCount) || event.byteCount < state.byteCount) {
        return failed(state, "The reported transfer size moved backwards.");
      }
      if (state.byteTotal !== null && event.byteCount > state.byteTotal) {
        return failed(state, "The transfer exceeded the published size.");
      }
      return { ...state, byteCount: event.byteCount };
    }
    case "finish": {
      if (state.phase !== "downloading") return state;
      if (!Number.isFinite(event.byteCount) || event.byteCount <= 0) {
        return failed(state, "The transfer reported no measured bytes, so it is not complete.");
      }
      if (state.byteTotal !== null && event.byteCount !== state.byteTotal) {
        return failed(state, "The measured size does not match the published size.");
      }
      if (state.publishedHash !== null && event.measuredHash !== state.publishedHash) {
        return failed(state, "The measured hash does not match the published hash.");
      }
      return {
        ...state,
        phase: "complete",
        byteCount: event.byteCount,
        measuredHash: event.measuredHash,
        reason: null,
      };
    }
    case "fail":
      return failed(state, event.reason);
    case "reset":
      return createDownloadState({
        assetName: state.assetName,
        version: state.version,
        publishedHash: state.publishedHash,
      });
    default:
      return state;
  }
}

/** Progress as a fraction, or null when the total size is unknown. */
export function downloadFraction(state: DownloadState): number | null {
  if (state.byteTotal === null || state.byteTotal <= 0) return null;
  return Math.min(1, state.byteCount / state.byteTotal);
}

/** The sentence a surface shows beside the transfer. */
export function describeDownload(state: DownloadState): string {
  switch (state.phase) {
    case "start":
      return `${state.assetName} ${state.version} has not started transferring.`;
    case "downloading":
      return state.byteTotal === null
        ? `Transferring ${state.assetName}: ${state.byteCount} bytes so far.`
        : `Transferring ${state.assetName}: ${state.byteCount} of ${state.byteTotal} bytes.`;
    case "complete":
      return `${state.assetName} ${state.version} transferred ${state.byteCount} bytes. The artifact is unsigned.`;
    default:
      return state.reason ?? "The transfer failed.";
  }
}
