import { contextBridge, ipcRenderer } from 'electron';

// A deliberately narrow bridge: window-chrome controls only. The game-state
// IPC surface belongs to the lane that owns src/shared/game/** and is added
// here once that contract exists, never guessed at from this scaffold.
export interface MaterialCookieClickerWindowApi {
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
}

export interface MaterialCookieClickerApi {
  window: MaterialCookieClickerWindowApi;
}

const api: MaterialCookieClickerApi = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
};

contextBridge.exposeInMainWorld('materialCookieClicker', Object.freeze(api));
