import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, app } from 'electron';
import isDev from 'electron-is-dev';
import { WINDOW_CONFIG } from '../src/config';

let setupWindow: BrowserWindow | null = null;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createSetupWindow(): BrowserWindow {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.show();
    setupWindow.focus();
    return setupWindow;
  }

  setupWindow = new BrowserWindow({
    width: WINDOW_CONFIG.setup.width,
    height: WINDOW_CONFIG.setup.height,
    frame: true,
    transparent: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  if (isDev) {
    void setupWindow.loadURL((process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5193') + '/setup.html');
  } else {
    void setupWindow.loadFile(path.join(app.getAppPath(), 'dist/renderer/setup.html'));
  }

  setupWindow.once('ready-to-show', () => setupWindow?.show());

  setupWindow.on('closed', () => {
    setupWindow = null;
    if (!BrowserWindow.getAllWindows().length) {
      app.quit();
    }
  });

  return setupWindow;
}

export function closeSetupWindow(): void {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.close();
  }
  setupWindow = null;
}
