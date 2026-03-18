import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  screen,
  session,
  systemPreferences
} from 'electron';
import isDev from 'electron-is-dev';
import {
  APP_BEHAVIOR,
  PROVIDER_DEFAULTS,
  WINDOW_CONFIG
} from '../src/config';
import { IPC_CHANNELS } from '../src/shared';
import { initAIHandlers } from './ipc/aiHandlers';
import { initAudioHandlers } from './ipc/audioHandlers';
import { initScreenshotHandlers } from './ipc/screenshotHandlers';
import { initWindowHandlers, registerWindowShortcuts } from './ipc/windowHandlers';
import { DeepgramProvider } from './providers/DeepgramProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import { OllamaProvider } from './providers/OllamaProvider';
import { WhisperProvider } from './providers/WhisperProvider';
import { createSetupWindow, closeSetupWindow } from './setupWindow';
import { setCodexWindow } from './services/codex';
import {
  clearMessages,
  getAllSettings,
  getUsageStats,
  initDatabase,
  loadSettingsCache,
  saveAllSettings
} from './services/database';
import { registry } from './services/providerRegistry';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let commonHandlersRegistered = false;
let overlayHandlersRegistered = false;
let setupHandlersRegistered = false;

const sessionId = `session-${Date.now()}`;

function getCodexBinaryCandidates(): string[] {
  return [
    process.env.CODEX_BIN,
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    path.join(os.homedir(), '.local', 'bin', 'codex'),
    'codex'
  ].filter(Boolean) as string[];
}

function centerOverlayWindow(window: BrowserWindow): void {
  const display = screen.getPrimaryDisplay();
  const x = display.workArea.x + Math.round((display.workArea.width - WINDOW_CONFIG.overlay.width) / 2);
  const y = display.workArea.y + Math.round((display.workArea.height - WINDOW_CONFIG.overlay.height) / 2);
  window.setPosition(x, y);
}

function loadRendererPage(window: BrowserWindow, page: 'index' | 'setup'): void {
  if (isDev) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5193';
    const suffix = page === 'setup' ? '/setup.html' : '';
    void window.loadURL(`${devServerUrl}${suffix}`);
    return;
  }

  const fileName = page === 'setup' ? 'setup.html' : 'index.html';
  void window.loadFile(path.join(app.getAppPath(), 'dist/renderer', fileName));
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: WINDOW_CONFIG.overlay.width,
    height: WINDOW_CONFIG.overlay.height,
    minWidth: WINDOW_CONFIG.overlay.minWidth,
    minHeight: WINDOW_CONFIG.overlay.minHeight,
    maxWidth: WINDOW_CONFIG.overlay.width,
    maxHeight: WINDOW_CONFIG.overlay.maxHeight,
    frame: false,
    transparent: true,
    backgroundColor: WINDOW_CONFIG.overlay.backgroundColor,
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
  window.setAlwaysOnTop(true, WINDOW_CONFIG.overlay.alwaysOnTopLevel);
  window.setVisibleOnAllWorkspaces(true);
  window.setIgnoreMouseEvents(false);
  centerOverlayWindow(window);
  loadRendererPage(window, 'index');
  return window;
}

function areProviderSettingsComplete(settings: ReturnType<typeof getAllSettings>): boolean {
  const hasLlm =
    (settings.llmProvider === 'gemini' && Boolean(settings.geminiApiKey.trim())) ||
    (settings.llmProvider === 'ollama' && Boolean(settings.ollamaEndpoint.trim()));
  const hasStt =
    (settings.sttProvider === 'deepgram' && Boolean(settings.deepgramApiKey.trim())) ||
    settings.sttProvider === 'whisper';
  return hasLlm && hasStt;
}

function registerPermissionHandlers(): void {
  // Keep Chromium media permissions narrowly scoped to the capabilities the overlay needs.
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) =>
    ['media', 'microphone', 'audioCapture', 'mediaKeySystem'].includes(permission)
  );

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['media', 'microphone', 'audioCapture', 'mediaKeySystem'].includes(permission));
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
}

async function requestMacMicrophonePermission(): Promise<void> {
  if (process.platform !== 'darwin') {
    return;
  }

  const micGranted = await systemPreferences.askForMediaAccess('microphone').catch(() => false);
  console.log('[MAIN] Microphone permission granted:', micGranted);
  if (!micGranted) {
    console.warn('[MAIN] Microphone permission denied — audio capture may not work');
  }
}

function registerCommonHandlers(): void {
  if (commonHandlersRegistered) {
    return;
  }
  commonHandlersRegistered = true;

  ipcMain.handle(IPC_CHANNELS.getSettings, () => getAllSettings());
  ipcMain.handle(IPC_CHANNELS.saveSettings, (_event, settings) => saveAllSettings(settings));
  ipcMain.handle(IPC_CHANNELS.clearHistory, () => {
    clearMessages();
  });
  ipcMain.handle(IPC_CHANNELS.getUsageStats, () => getUsageStats());

  ipcMain.handle(IPC_CHANNELS.getCodexStatus, () => {
    for (const candidate of getCodexBinaryCandidates()) {
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

  ipcMain.on(
    IPC_CHANNELS.rendererDebugLog,
    (_event, payload: { level: 'log' | 'warn' | 'error'; message: string; data?: unknown }) => {
      const logger = payload.level === 'error' ? console.error : payload.level === 'warn' ? console.warn : console.log;
      if (payload.data !== undefined) {
        logger(`[RENDERER] ${payload.message}`, payload.data);
        return;
      }
      logger(`[RENDERER] ${payload.message}`);
    }
  );
}

async function launchOverlay(): Promise<void> {
  if (overlayHandlersRegistered && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = createMainWindow();
  setCodexWindow(mainWindow);

  initWindowHandlers(mainWindow);
  initAudioHandlers(mainWindow);
  const screenshots = initScreenshotHandlers(mainWindow);
  initAIHandlers(mainWindow, sessionId, screenshots.captureFullScreen);

  // Shortcuts are registered only after the overlay exists, since they forward into its webContents.
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

  overlayHandlersRegistered = true;
}

function registerSetupHandlers(): void {
  if (setupHandlersRegistered) {
    return;
  }
  setupHandlersRegistered = true;

  ipcMain.handle(
    'setup:testLLM',
    async (
      _event,
      config: {
        provider: 'gemini' | 'ollama';
        geminiApiKey?: string;
        geminiModel?: string;
        ollamaEndpoint?: string;
        ollamaModel?: string;
      }
    ) => {
      try {
        if (config.provider === 'gemini') {
          const provider = new GeminiProvider({
            apiKey: config.geminiApiKey || '',
            model: config.geminiModel || PROVIDER_DEFAULTS.geminiModel
          });
          return await provider.testConnection();
        }

        const provider = new OllamaProvider({
          endpoint: config.ollamaEndpoint || 'http://localhost:11434',
          model: config.ollamaModel || PROVIDER_DEFAULTS.ollamaModel
        });
        return await provider.testConnection();
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle(
    'setup:testSTT',
    async (
      _event,
      config: {
        provider: 'deepgram' | 'whisper';
        deepgramApiKey?: string;
        deepgramModel?: string;
        whisperModel?: string;
      }
    ) => {
      try {
        if (config.provider === 'deepgram') {
          const provider = new DeepgramProvider({
            apiKey: config.deepgramApiKey || '',
            model: config.deepgramModel || PROVIDER_DEFAULTS.deepgramModel
          });
          return await provider.testConnection();
        }

        const provider = new WhisperProvider({
          model: config.whisperModel || PROVIDER_DEFAULTS.whisperModel,
          language: PROVIDER_DEFAULTS.whisperLanguage
        });
        return await provider.testConnection();
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle('setup:saveSettings', async (_event, settings) => {
    saveAllSettings(settings);
    return { ok: true };
  });

  ipcMain.handle('setup:complete', async () => {
    const settings = getAllSettings();
    registry.initFromSettings(settings);
    closeSetupWindow();
    await launchOverlay();
    return { ok: true };
  });

  ipcMain.handle('setup:open', async () => {
    const setupWindow = createSetupWindow();
    loadRendererPage(setupWindow, 'setup');
    return { ok: true };
  });
}

function showSetupWindowOnLaunch(): void {
  const settings = getAllSettings();
  console.log('[MAIN] Showing setup window on launch', {
    isDev,
    setupComplete: areProviderSettingsComplete(settings),
    alwaysShowSetupOnLaunch: APP_BEHAVIOR.alwaysShowSetupOnLaunch
  });

  const setupWindow = createSetupWindow();
  loadRendererPage(setupWindow, 'setup');
}

async function bootstrap(): Promise<void> {
  try {
    await app.whenReady();

    registerPermissionHandlers();
    await requestMacMicrophonePermission();

    initDatabase();
    loadSettingsCache();
    registerCommonHandlers();
    registerSetupHandlers();

    // Current product behavior is to route every launch through setup so users can pick providers each time.
    if (APP_BEHAVIOR.alwaysShowSetupOnLaunch || !areProviderSettingsComplete(getAllSettings())) {
      showSetupWindowOnLaunch();
    } else {
      registry.initFromSettings(getAllSettings());
      console.log('[MAIN] Providers initialised from settings');
      await launchOverlay();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        showSetupWindowOnLaunch();
        return;
      }

      mainWindow?.show();
      mainWindow?.setIgnoreMouseEvents(false);
    });
  } catch (error) {
    console.error('[MAIN] Fatal bootstrap error', error);
    app.quit();
  }
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
