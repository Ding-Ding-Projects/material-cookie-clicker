import { decodeSave, encodeSave, type DecodeSaveResult } from "../../shared/game/save-codec.js";
import type { GameIpcApi } from "../../shared/game/ipc-contracts.js";
import type { OfflineProgressOptions } from "../../shared/game/offline-progress.js";
import type { GameState } from "../../shared/game/types.js";
import type { Bilingual } from "./copy.js";

/**
 * Persistence, with a graceful two-tier strategy.
 *
 * The IPC contract this reads from (`window.materialCookieClicker.game`, see
 * ipc-contracts.ts and material-cookie-clicker-api.d.ts) is not wired into the real preload
 * bridge yet — `src/preload/index.ts` and `src/main/main.ts` are both outside this lane's
 * allowed paths, so a future lane completes that wiring. Persistence still has to actually
 * work TODAY, so `resolvePersistence()` prefers the IPC bridge when present and falls back to
 * `window.localStorage` otherwise. Once preload exposes `game`, this module picks it up with
 * no further changes — the fallback path simply stops being exercised.
 */

/** Cap on how much elapsed wall-clock time counts toward offline production. */
export const OFFLINE_PROGRESS_OPTIONS: OfflineProgressOptions = {
  maxOfflineMs: 24 * 60 * 60 * 1000, // 24 hours
  offlineCpsFactor: 0.5, // 50% of normal CPS while away — genre-standard.
};

export interface LoadedSave {
  readonly outcome: "fresh" | "loaded" | "quarantined";
  readonly state: GameState | null;
  /**
   * Why the load did not go cleanly, as a bilingual pair. This used to be a bare English string
   * that OFFLINE_COPY.saveCorrupt interpolated into BOTH language variants, which left the
   * Cantonese sentence carrying an untranslated English clause. Every reason produced here now
   * has a real yue rendering; the only English that can survive is a raw engine message, and
   * that is explicitly framed as such in both languages.
   */
  readonly detail: Bilingual | null;
}

/** Frames a raw, untranslatable engine message so the yue sentence still reads as Cantonese. */
function rawEngineDetail(message: string): Bilingual {
  return { en: message, yue: `系統訊息：${message}` };
}

export interface GamePersistence {
  load(): Promise<LoadedSave>;
  save(state: GameState): Promise<void>;
  wipe(): Promise<void>;
}

/** The narrow subset of the Web Storage API this module needs, for test injection. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const LOCAL_KEY = "material-cookie-clicker:save:v1";
const LOCAL_BACKUP_KEY = "material-cookie-clicker:save:v1:backup";
const LOCAL_QUARANTINE_PREFIX = "material-cookie-clicker:save:v1:corrupt:";

function decodeRaw(raw: string): DecodeSaveResult | { ok: false; reason: "malformed"; detail: string } {
  try {
    return decodeSave(JSON.parse(raw));
  } catch (error) {
    return { ok: false, reason: "malformed", detail: error instanceof Error ? error.message : "Invalid JSON." };
  }
}

function describeDecodeFailure(result: Exclude<DecodeSaveResult, { ok: true }>): Bilingual {
  if (result.reason === "future-version") {
    return {
      en: `Save was written by a newer version (schema ${result.foundVersion}; this build supports up to ${result.maxSupportedVersion}).`,
      yue: `存檔係新版本寫嘅（結構版本 ${result.foundVersion}；呢個版本最多支援到 ${result.maxSupportedVersion}）。`,
    };
  }
  if (result.reason === "malformed") return { en: "malformed save data", yue: "存檔格式錯誤" };
  return rawEngineDetail(result.detail);
}

/**
 * Local-storage-backed fallback. A corrupt or unreadable primary save falls back to the
 * backup copy (written just before the primary is overwritten, see `save()`); if THAT also
 * fails, the bad payload is preserved under a timestamped quarantine key — never silently
 * discarded — and the caller starts fresh.
 */
export function createLocalStoragePersistence(storage: StorageLike): GamePersistence {
  return {
    async load(): Promise<LoadedSave> {
      const primary = storage.getItem(LOCAL_KEY);
      if (primary === null) return { outcome: "fresh", state: null, detail: null };

      const primaryResult = decodeRaw(primary);
      if (primaryResult.ok) return { outcome: "loaded", state: primaryResult.state, detail: null };

      const backup = storage.getItem(LOCAL_BACKUP_KEY);
      if (backup !== null) {
        const backupResult = decodeRaw(backup);
        if (backupResult.ok) {
          return {
            outcome: "loaded",
            state: backupResult.state,
            detail: {
              en: `Primary save was unreadable (${describeDecodeFailure(primaryResult).en}); recovered from the previous autosave instead.`,
              yue: `主存檔讀唔到（${describeDecodeFailure(primaryResult).yue}）；改為由上一次自動存檔復原。`,
            },
          };
        }
      }

      const quarantineKey = `${LOCAL_QUARANTINE_PREFIX}${new Date().toISOString().replace(/[:.]/g, "-")}`;
      storage.setItem(quarantineKey, primary);
      return { outcome: "quarantined", state: null, detail: describeDecodeFailure(primaryResult) };
    },

    async save(state: GameState): Promise<void> {
      const payload = JSON.stringify(encodeSave(state));
      try {
        const existing = storage.getItem(LOCAL_KEY);
        if (existing !== null) storage.setItem(LOCAL_BACKUP_KEY, existing);
        storage.setItem(LOCAL_KEY, payload);
      } catch {
        // Quota exceeded or storage unavailable mid-session: swallow and let the next
        // autosave retry rather than crashing the game over a persistence hiccup.
      }
    },

    async wipe(): Promise<void> {
      storage.removeItem(LOCAL_KEY);
      storage.removeItem(LOCAL_BACKUP_KEY);
    },
  };
}

/** Wraps the (future) real IPC bridge in the same `GamePersistence` shape. */
export function createIpcPersistence(bridge: GameIpcApi): GamePersistence {
  return {
    async load(): Promise<LoadedSave> {
      const response = await bridge.load();
      if (response.ok) {
        if (response.save === null) return { outcome: "fresh", state: null, detail: null };
        const decoded = decodeSave(response.save);
        if (decoded.ok) return { outcome: "loaded", state: decoded.state, detail: null };
        return { outcome: "quarantined", state: null, detail: describeDecodeFailure(decoded) };
      }
      return { outcome: "quarantined", state: null, detail: rawEngineDetail(response.detail) };
    },
    async save(state: GameState): Promise<void> {
      await bridge.save(encodeSave(state));
    },
    async wipe(): Promise<void> {
      await bridge.wipe();
    },
  };
}

/** A no-op persistence for environments with neither IPC nor localStorage available. */
export const NULL_PERSISTENCE: GamePersistence = {
  async load() {
    return { outcome: "fresh", state: null, detail: null };
  },
  async save() {
    // Nothing to do — progress simply does not survive a restart in this environment.
  },
  async wipe() {
    // Nothing to do.
  },
};

/** Picks the best available persistence backend at runtime. */
export function resolvePersistence(): GamePersistence {
  const bridge = typeof window !== "undefined" ? window.materialCookieClicker?.game : undefined;
  if (bridge) return createIpcPersistence(bridge);
  if (typeof window !== "undefined" && window.localStorage) {
    return createLocalStoragePersistence(window.localStorage);
  }
  return NULL_PERSISTENCE;
}
