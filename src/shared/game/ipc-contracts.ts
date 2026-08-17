import type { UpdateStatus } from "./updates.js";
import type { DieselVoucher, DieselVoucherLedger } from "./diesel-exchange.js";
import type { SaveDataLatest } from "./save-schema.js";

/**
 * The IPC contract between the renderer's game screens and the main-process save service.
 *
 * This file only DESCRIBES the contract (channel names + payload/response shapes) — it is
 * consumed by `src/main/game-ipc.ts` (which registers real `ipcMain.handle` listeners against
 * it) and is meant to be consumed by a future `src/preload/index.ts` bridge that exposes
 * `window.materialCookieClicker.game` implementing `GameIpcApi` below. Neither `src/preload/**`
 * nor `src/main/main.ts` are in this lane's allowed paths, so that bridge is not wired yet —
 * see `src/renderer/game/persistence.ts` for how the renderer degrades gracefully (falling
 * back to localStorage) until a future lane completes the wiring.
 */

/** IPC channel names shared by the (future) preload bridge and the main-process handlers. */
export const GAME_IPC_CHANNELS = {
  load: "game:load",
  save: "game:save",
  wipe: "game:wipe",
} as const;

export type GameIpcChannel = (typeof GAME_IPC_CHANNELS)[keyof typeof GAME_IPC_CHANNELS];

/**
 * Result of asking the main process for the current save.
 *   - `{ ok: true, save: null }` — no save file exists yet (first run).
 *   - `{ ok: true, save }` — a valid save was decoded.
 *   - `{ ok: false, ... }` — the save on disk could not be decoded. The bad bytes were
 *     preserved beside the good path (see `quarantinedAs`) and were never silently discarded.
 */
export type GameLoadResponse =
  | { readonly ok: true; readonly save: SaveDataLatest | null }
  | { readonly ok: false; readonly detail: string; readonly quarantinedAs: string | null };

export type GameSaveResponse = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export type GameWipeResponse = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** The shape a preload bridge exposes to the renderer once it is wired up. */
export interface GameIpcApi {
  load(): Promise<GameLoadResponse>;
  save(save: SaveDataLatest): Promise<GameSaveResponse>;
  wipe(): Promise<GameWipeResponse>;
}

/**
 * THE DIESEL EXCHANGE CHANNELS.
 *
 * Unlike the game-save channels above, these two ARE wired end to end in this build:
 * `src/main/main.ts` registers them against `DieselLedgerService`, `src/preload/index.ts`
 * exposes them as `window.materialCookieClicker.diesel`, and `GameProvider` calls `mint` as a
 * side effect of the `mintDiesel` reducer action. The renderer holds no file-system access of
 * its own — it asks, the main process writes.
 */
export const DIESEL_IPC_CHANNELS = {
  mint: "diesel:mint",
  read: "diesel:read",
} as const;

/** What the renderer sends to mint a voucher. The timestamp is NOT here on purpose: the main
 *  process stamps `mintedAt` from its own clock. */
export interface DieselMintRequest {
  readonly litres: number;
  /** Cookies paid, already rendered as the ledger's decimal string (see cookiesSpentString). */
  readonly cookiesSpent: string;
}

export type DieselMintResponse =
  | { readonly ok: true; readonly voucher: DieselVoucher; readonly filePath: string }
  | { readonly ok: false; readonly reason: string };

export type DieselReadResponse =
  | { readonly ok: true; readonly ledger: DieselVoucherLedger; readonly filePath: string }
  | { readonly ok: false; readonly reason: string };

/** The shape the preload bridge exposes to the renderer for the exchange. */
export interface DieselIpcApi {
  mint(request: DieselMintRequest): Promise<DieselMintResponse>;
  read(): Promise<DieselReadResponse>;
}

/**
 * THE UPDATE CHANNELS.
 *
 * Two, and deliberately asymmetric: `status` is a one-way PUSH from main to renderer (the main
 * process owns the updater and tells the window what it knows), and `restart` is a one-way
 * command the other way, sent only by the notice's Restart button. The renderer cannot start a
 * check, cannot choose a feed and cannot ask where the package came from — same discipline as
 * the window channels, where the renderer asks and the main process decides.
 */
export const UPDATE_IPC_CHANNELS = {
  /** main → renderer: the current `UpdateStatus`. */
  status: "update:status",
  /** renderer → main: replay the current status (the window asks once, on mount). */
  requestStatus: "update:request-status",
  /** renderer → main: quit and install the package Squirrel already downloaded. */
  restart: "update:restart",
} as const;

/** The shape the preload bridge exposes to the renderer for updates. */
export interface UpdateIpcApi {
  /** Subscribes to status pushes. Returns the unsubscribe function. */
  onStatus(listener: (status: UpdateStatus) => void): () => void;
  /** Asks the main process to push the current status again. */
  requestStatus(): void;
  /** Quits and installs. Only ever sent from the notice's Restart button. */
  restart(): void;
}
