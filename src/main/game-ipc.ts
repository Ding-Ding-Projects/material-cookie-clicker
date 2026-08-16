import { decodeSave, encodeSave } from "../shared/game/save-codec.js";
import {
  GAME_IPC_CHANNELS,
  type GameLoadResponse,
  type GameSaveResponse,
  type GameWipeResponse,
} from "../shared/game/ipc-contracts.js";
import type { SaveDataLatest } from "../shared/game/save-schema.js";
import type { GameSaveService } from "./game-save-service.js";

/**
 * The subset of Electron's `ipcMain` this module needs. Declaring it as a narrow structural
 * interface (rather than importing `ipcMain` from `electron` directly) keeps this module
 * testable with a plain in-memory fake, and keeps the real wiring — `ipcMain.handle(...)` calls
 * from `src/main/main.ts` — as the only place that needs to touch the real Electron module.
 * `src/main/main.ts` is outside this lane's allowed paths, so calling `registerGameIpc` from
 * there is left for whichever lane owns that wiring next.
 */
export interface IpcHandleRegistrar {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>): void;
}

/** Registers the three game-save IPC handlers against `registrar`, backed by `saveService`. */
export function registerGameIpc(registrar: IpcHandleRegistrar, saveService: GameSaveService): void {
  registrar.handle(GAME_IPC_CHANNELS.load, async (): Promise<GameLoadResponse> => {
    const result = await saveService.load();
    if (result.outcome === "not-found") {
      return { ok: true, save: null };
    }
    if (result.outcome === "ok" && result.state) {
      return { ok: true, save: encodeSave(result.state) };
    }
    return {
      ok: false,
      detail: result.detail ?? "The save file could not be read.",
      quarantinedAs: result.quarantinedPath,
    };
  });

  registrar.handle(GAME_IPC_CHANNELS.save, async (_event, payload: unknown): Promise<GameSaveResponse> => {
    const decoded = decodeSave(payload as SaveDataLatest);
    if (!decoded.ok) {
      return { ok: false, reason: "The save payload failed validation and was not written to disk." };
    }
    try {
      await saveService.save(decoded.state);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : "Unknown error while saving." };
    }
  });

  registrar.handle(GAME_IPC_CHANNELS.wipe, async (): Promise<GameWipeResponse> => {
    try {
      await saveService.wipe();
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : "Unknown error while wiping the save." };
    }
  });
}
