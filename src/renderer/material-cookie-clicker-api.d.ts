import type { MaterialCookieClickerApi } from '../preload/index';
import type { GameIpcApi } from '../shared/game/ipc-contracts.js';

declare global {
  interface Window {
    materialCookieClicker: MaterialCookieClickerApi;
  }
}

// Additive module augmentation: extends the preload's `MaterialCookieClickerApi` interface
// with an optional `game` bridge, WITHOUT editing src/preload/index.ts (out of this lane's
// allowed paths). At runtime `window.materialCookieClicker.game` is `undefined` until a future
// lane wires this into the actual preload bridge — see src/renderer/game/persistence.ts for how
// the renderer degrades to a local fallback in the meantime.
declare module '../preload/index' {
  interface MaterialCookieClickerApi {
    game?: GameIpcApi;
  }
}

export {};
