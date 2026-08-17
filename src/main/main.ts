import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';

import { DieselLedgerService } from './diesel-ledger-service.js';
import { UpdateService } from './update-service.js';
import {
  UPDATE_IPC_CHANNELS,
  DIESEL_IPC_CHANNELS,
  type DieselMintRequest,
  type DieselMintResponse,
  type DieselReadResponse,
} from '../shared/game/ipc-contracts.js';

const PRODUCT_NAME = 'Material Cookie Clicker';
const PRODUCT_APP_ID = 'org.dingdingprojects.materialcookieclicker';

const dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;

app.setName(PRODUCT_NAME);
app.setAppUserModelId(PRODUCT_APP_ID);

if (squirrelStartup) app.quit();

// Keep one process as the sole owner of the game window. A second launch
// simply focuses the existing one instead of opening a duplicate.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    // 1440×900 by owner decree — 1024×720 squeezed the rail into one-word-per-line wrapping.
    width: 1440,
    height: 900,
    minWidth: 480,
    minHeight: 420,
    // RESIZING IS A PURCHASE (src/shared/game/control-unlocks.ts, "chrome.resize").
    //
    // Enforced here rather than in CSS, because on a frameless window the resize grips are drawn
    // and handled by the operating system: there is no renderer-side element to disable, and a
    // renderer that merely pretended would still leave the real edges live. The window therefore
    // STARTS not resizable and the renderer asks for it to be made resizable once the unlock is
    // actually in the save — see the 'window:set-resizable' handler below.
    resizable: false,
    show: false,
    title: PRODUCT_NAME,
    icon: path.join(dirname, '..', '..', 'assets', 'material-cookie-clicker.ico'),
    // A frameless window with our own Material title bar, never the OS chrome.
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#FFF8F1',
    webPreferences: {
      preload: path.join(dirname, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });
  window.webContents.on('page-title-updated', (event) => {
    event.preventDefault();
    window.setTitle(PRODUCT_NAME);
  });
  window.once('ready-to-show', () => window.showInactive());
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    console.error(`Material Cookie Clicker renderer failed to load (${errorCode}): ${errorDescription} — ${validatedURL}`);
    window.setTitle(PRODUCT_NAME);
  });
  void window.loadFile(path.join(dirname, '..', 'renderer', 'index.html')).catch((error: unknown) => {
    console.error(`Material Cookie Clicker renderer load failed: ${(error as Error).message}`);
    window.setTitle(PRODUCT_NAME);
  });
  return window;
}

void app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  mainWindow = createWindow();
  mainWindow.on('closed', () => { mainWindow = null; });

  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:toggle-maximize', () => {
    if (!mainWindow) return;
    // Herng-Ha-App quirk: maximize() on a non-resizable window does not maximize — on Windows it
    // just moves the window to the top-left corner at its old size (the resize purchase keeps the
    // window non-resizable until bought, so this is the common case). Lift the flag for the
    // operation and put it back, so a bought maximize behaves like a real one without quietly
    // granting the resize purchase.
    const wasResizable = mainWindow.isResizable();
    if (!wasResizable) mainWindow.setResizable(true);
    if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
    if (!wasResizable) mainWindow.setResizable(false);
  });
  // The close CHANNEL always closes — by the time the renderer sends it, the one-cookie exit
  // rung is bought (the locked button is a price plate that does not send). The gate lives on
  // the window's own close event below, covering Alt+F4 and the OS close message.
  ipcMain.on('window:close', () => mainWindow?.close());

  // The renderer half of the resize purchase. It sends the current answer on startup and again
  // whenever the unlock is bought; the main process is the only thing that can actually move the
  // flag. `Boolean(...)` rather than trusting the payload's type, because this channel is
  // reachable from the renderer and a truthy string should not be able to buy anything.
  ipcMain.on('window:set-resizable', (_event, resizable: unknown) => {
    mainWindow?.setResizable(resizable === true);
  });

  // The one-cookie exit (chrome.close). Before it is bought, a close request — the (locked)
  // button would not send one, but Alt+F4 and the OS close message do — is softly refused and
  // the renderer is told so it can flash the price plate. OS shutdown/session end are never
  // fought: Electron cannot veto session-end on Windows, and we do not try.
  let closeAllowed = false;
  ipcMain.on('window:set-close-allowed', (_event, allowed: unknown) => {
    closeAllowed = allowed === true;
  });
  mainWindow.on('close', (event) => {
    if (!closeAllowed) {
      event.preventDefault();
      mainWindow?.webContents.send('window:close-refused');
    }
  });

  // The diesel voucher exchange with WinForge. `app.getPath('appData')` is the OS roaming
  // application-data directory (%APPDATA% on Windows); the service puts the shared ledger at
  // <appData>/DingDingProjects/exchange/diesel-vouchers.json, which is the location both
  // applications agreed on in docs/winforge-diesel-exchange.md. Resolving it HERE, once, is
  // what keeps the path out of the renderer entirely.
  const dieselLedger = new DieselLedgerService(app.getPath('appData'));

  ipcMain.handle(DIESEL_IPC_CHANNELS.mint, async (_event, request: DieselMintRequest): Promise<DieselMintResponse> => {
    const litres = Number((request as DieselMintRequest | undefined)?.litres);
    const cookiesSpent = String((request as DieselMintRequest | undefined)?.cookiesSpent ?? '');
    const result = await dieselLedger.mint(litres, cookiesSpent);
    if (!result.ok) return result;
    return { ok: true, voucher: result.voucher, filePath: dieselLedger.filePath };
  });

  ipcMain.handle(DIESEL_IPC_CHANNELS.read, async (): Promise<DieselReadResponse> => {
    const result = await dieselLedger.read();
    if (!result.ok) return result;
    return { ok: true, ledger: result.ledger, filePath: dieselLedger.filePath };
  });

  // Automatic updates against the unsigned Squirrel.Windows feed the release pipeline publishes
  // (see src/shared/game/updates.ts for what Squirrel does and does not guarantee). The service
  // is started unconditionally: in a development checkout it works out that there is no updater
  // behind it, logs that, and publishes an `unsupported` status the notice never renders.
  const updates = new UpdateService();
  const pushStatus = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(UPDATE_IPC_CHANNELS.status, updates.current);
  };
  updates.onStatus(pushStatus);
  ipcMain.on(UPDATE_IPC_CHANNELS.requestStatus, pushStatus);
  ipcMain.on(UPDATE_IPC_CHANNELS.restart, () => updates.restartAndInstall());
  app.on('before-quit', () => updates.stop());
  updates.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      mainWindow.on('closed', () => { mainWindow = null; });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (error) => {
  console.error(`Material Cookie Clicker startup/runtime exception: ${error.message}`);
});
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error(`Material Cookie Clicker startup/runtime rejection: ${message}`);
});
