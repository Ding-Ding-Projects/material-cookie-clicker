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
