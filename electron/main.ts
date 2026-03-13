import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import path from 'path';
import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  session,
  screen,
  systemPreferences
} from 'electron';
import isDev from 'electron-is-dev';
import { IPC_CHANNELS, WINDOW_DIMENSIONS } from '../src/shared';
import { initAIHandlers } from './ipc/aiHandlers';
import { initAudioHandlers } from './ipc/audioHandlers';
import { initScreenshotHandlers } from './ipc/screenshotHandlers';
import { initWindowHandlers, registerWindowShortcuts } from './ipc/windowHandlers';
import {
  clearMessages,
  getAllSettings,
  getUsageStats,
  initDatabase,
  loadSettingsCache,
  saveAllSettings
} from './services/database';
import { setCodexWindow } from './services/codex';

let mainWindow: BrowserWindow | null = null;
const sessionId = `session-${Date.now()}`;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function positionWindow(window: BrowserWindow): void {
  const display = screen.getPrimaryDisplay();
  const x = display.workArea.x + Math.round((display.workArea.width - WINDOW_DIMENSIONS.width) / 2);
  const y = display.workArea.y + Math.round((display.workArea.height - WINDOW_DIMENSIONS.height) / 2);
  window.setPosition(x, y);
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: WINDOW_DIMENSIONS.width,
    height: WINDOW_DIMENSIONS.height,
    minWidth: WINDOW_DIMENSIONS.minWidth,
    minHeight: WINDOW_DIMENSIONS.minHeight,
    maxWidth: WINDOW_DIMENSIONS.width,
    maxHeight: 360,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  if (process.platform === 'win32') {
    (window as BrowserWindow & { setWindowDisplayAffinity?: (value: 'screen') => void }).setWindowDisplayAffinity?.(
      'screen'
    );
  }
  window.setContentProtection(true);
  window.setAlwaysOnTop(true, 'screen-saver');
  window.setVisibleOnAllWorkspaces(true);
  window.setIgnoreMouseEvents(false);
  positionWindow(window);

  if (isDev) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5193');
  } else {
    void window.loadFile(path.join(process.cwd(), 'dist/renderer/index.html'));
  }

  return window;
}

async function bootstrap(): Promise<void> {
  await app.whenReady();
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return ['media', 'microphone', 'audioCapture', 'mediaKeySystem'].includes(permission);
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (['media', 'microphone', 'audioCapture', 'mediaKeySystem'].includes(permission)) {
      callback(true);
      return;
    }

    callback(false);
  });

  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1, height: 1 }
      });

      callback({
        video: sources[0],
        ...(process.platform === 'win32' ? { audio: 'loopback' as const } : {})
      });
    },
    { useSystemPicker: false }
  );

  if (process.platform === 'darwin') {
    void systemPreferences.askForMediaAccess('microphone').catch(() => undefined);
  }

  initDatabase();
  loadSettingsCache();

  mainWindow = createMainWindow();
  setCodexWindow(mainWindow);
  initWindowHandlers(mainWindow);
  initAudioHandlers(mainWindow);
  const screenshots = initScreenshotHandlers(mainWindow);
  initAIHandlers(mainWindow, sessionId, screenshots.captureFullScreen);

  ipcMain.handle(IPC_CHANNELS.getSettings, () => getAllSettings());
  ipcMain.on(IPC_CHANNELS.rendererDebugLog, (_event, payload: { level: 'log' | 'warn' | 'error'; message: string; data?: unknown }) => {
    const logger = payload.level === 'error' ? console.error : payload.level === 'warn' ? console.warn : console.log;
    if (payload.data !== undefined) {
      logger(`[RENDERER] ${payload.message}`, payload.data);
      return;
    }
    logger(`[RENDERER] ${payload.message}`);
  });
  ipcMain.handle(IPC_CHANNELS.getCodexStatus, () => {
    const candidates = [
      process.env.CODEX_BIN,
      '/opt/homebrew/bin/codex',
      '/usr/local/bin/codex',
      'codex'
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      if (candidate.includes('/')) {
        if (spawnSync('test', ['-x', candidate]).status === 0) {
          return { found: true, path: candidate };
        }
        continue;
      }

      const resolved = spawnSync('which', [candidate], { encoding: 'utf8' }).stdout.trim();
      if (resolved) {
        return { found: true, path: resolved };
      }
    }

    return { found: false, path: null };
  });
  ipcMain.handle(IPC_CHANNELS.saveSettings, (_event, settings) => {
    saveAllSettings(settings);
  });
  ipcMain.handle(IPC_CHANNELS.clearHistory, () => {
    clearMessages();
  });
  ipcMain.handle(IPC_CHANNELS.getUsageStats, () => getUsageStats());

  registerWindowShortcuts(
    mainWindow,
    () => mainWindow?.webContents.send(IPC_CHANNELS.triggerAnswer),
    () => {
      void screenshots.captureFullScreen().then((image) => {
        mainWindow?.webContents.send(IPC_CHANNELS.screenshotCaptured, image);
      });
    },
    () => {
      void screenshots.captureSelectiveScreen().then((image) => {
        mainWindow?.webContents.send(IPC_CHANNELS.screenshotCaptured, image);
      });
    }
  );

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    } else {
      mainWindow?.show();
      mainWindow?.setIgnoreMouseEvents(false);
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

void bootstrap();
