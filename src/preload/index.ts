import { contextBridge, ipcRenderer } from 'electron';

import {
  DIESEL_IPC_CHANNELS,
  type DieselIpcApi,
  type DieselMintRequest,
  type DieselMintResponse,
  type DieselReadResponse,
} from '../shared/game/ipc-contracts.js';

// A deliberately narrow bridge: window-chrome controls, plus the two diesel-exchange calls.
// The game-state save IPC surface is still not exposed here — the renderer persists to
// localStorage today (see src/renderer/game/persistence.ts) and wiring that over is a separate
// change with its own save-migration question to answer.
export interface MaterialCookieClickerWindowApi {
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  /**
   * Tells the main process whether the window may be resized at all — the renderer half of the
   * "chrome.resize" control purchase (src/shared/game/control-unlocks.ts). It is a REQUEST, not
   * a decision: the main process owns the window flag, and the window is created not resizable,
   * so a renderer that never calls this can never make the edges live.
   */
  setResizable: (resizable: boolean) => void;
  setCloseAllowed: (allowed: boolean) => void;
}

export interface MaterialCookieClickerApi {
  window: MaterialCookieClickerWindowApi;
  /**
   * The diesel voucher exchange with WinForge (see src/shared/game/diesel-exchange.ts). Two
   * calls, both of which end in the main process: mint a voucher, or read the ledger back. The
   * renderer gets no path, no handle and no `fs` — only these two questions.
   */
  diesel: DieselIpcApi;
}

const api: MaterialCookieClickerApi = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    setResizable: (resizable: boolean) => ipcRenderer.send('window:set-resizable', resizable === true),
    setCloseAllowed: (allowed: boolean) => ipcRenderer.send('window:set-close-allowed', allowed === true),
  },
  diesel: {
    mint: (request: DieselMintRequest): Promise<DieselMintResponse> =>
      ipcRenderer.invoke(DIESEL_IPC_CHANNELS.mint, request) as Promise<DieselMintResponse>,
    read: (): Promise<DieselReadResponse> =>
      ipcRenderer.invoke(DIESEL_IPC_CHANNELS.read) as Promise<DieselReadResponse>,
  },
};

contextBridge.exposeInMainWorld('materialCookieClicker', Object.freeze(api));
