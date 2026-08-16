import type { MaterialCookieClickerApi } from '../preload/index';

declare global {
  interface Window {
    materialCookieClicker: MaterialCookieClickerApi;
  }
}

export {};
