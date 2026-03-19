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
  shell,
  systemPreferences
} from 'electron';
import isDev from 'electron-is-dev';
import {
  APP_BEHAVIOR,
  LEGACY_PROVIDER_VALUES,
  PROVIDER_DEFAULTS,
  WINDOW_CONFIG
} from '../src/config';
import { IPC_CHANNELS } from '../src/shared';
import { initAIHandlers } from './ipc/aiHandlers';
import { initAudioHandlers, stopAudioCapturePipeline } from './ipc/audioHandlers';
import { initScreenshotHandlers } from './ipc/screenshotHandlers';
import { initSessionHandlers } from './ipc/sessionHandlers';
import { initWindowHandlers, registerWindowShortcuts } from './ipc/windowHandlers';
import { DeepgramProvider } from './providers/DeepgramProvider';
import { CodexProvider } from './providers/CodexProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import { OllamaProvider } from './providers/OllamaProvider';
import { WhisperProvider } from './providers/WhisperProvider';
import { createSetupWindow, closeSetupWindow } from './setupWindow';
import { clearActiveSession, getActiveSession, setActiveSession } from './services/activeSession';
import {
  clearMessages,
  getAllSettings,
  getUsageStats,
  initDatabase,
  saveAllSettings
} from './services/database';
import { registry } from './services/providerRegistry';
import { registerDashboardCommandHandlers } from './services/dashboardCommands';
import { getDashboardAppUrl, startDashboardWebServer, stopDashboardWebServer } from './services/dashboardWebServer';
import { sessionService } from './services/SessionService';
import { summarizationService } from './services/SummarizationService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let commonHandlersRegistered = false;
let overlayHandlersRegistered = false;
let setupHandlersRegistered = false;
let sessionLifecycleHandlersRegistered = false;
let overlayCloseInFlight = false;
let overlaySessionEndPromise: Promise<string | null> | null = null;
let pendingSummaryJobs = 0;

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

function normalizeCodexModel(model?: string): string {
  const trimmedModel = (model || '').trim();
  if (trimmedModel === LEGACY_PROVIDER_VALUES.codexUnsupportedDefaultModel) {
    return '';
  }
  return trimmedModel;
}

function centerOverlayWindow(window: BrowserWindow): void {
  const display = screen.getPrimaryDisplay();
  const MENU_BAR_HEIGHT = 24;
  const TOP_SAFE_BUFFER = 16;
  const safeY = display.workArea.y + MENU_BAR_HEIGHT + TOP_SAFE_BUFFER;
  const x = display.workArea.x + Math.round((display.workArea.width - WINDOW_CONFIG.overlay.width) / 2);
  const centeredY = display.workArea.y + Math.round((display.workArea.height - WINDOW_CONFIG.overlay.height) / 2);
  window.setPosition(x, Math.max(safeY, centeredY));
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

async function startOverlaySession(): Promise<void> {
  const providers = registry.getActiveProviderLabels();
  const session = await sessionService.startSession(providers);
  setActiveSession({
    sessionId: session.id,
    createdAt: session.createdAt,
    providerLlm: session.providerLlm,
    providerStt: session.providerStt
  });
  console.log('[SESSION] Started overlay session', {
    sessionId: session.id,
    providers
  });
}

async function endActiveOverlaySession(): Promise<string | null> {
  const activeSession = getActiveSession();
  if (!activeSession) {
    return null;
  }

  if (!overlaySessionEndPromise) {
    overlaySessionEndPromise = (async () => {
      try {
        stopAudioCapturePipeline();
        const session = await sessionService.endSession(activeSession.sessionId);
        pendingSummaryJobs += 1;
        void summarizationService
          .summarizeSession(session.id)
          .catch((error) => {
            console.warn('[SUMMARY] Background summarization failed', error);
          })
          .finally(() => {
            pendingSummaryJobs = Math.max(0, pendingSummaryJobs - 1);
          });
        console.log('[SESSION] Ended overlay session', {
          sessionId: session.id,
          durationMs: session.durationMs,
          utteranceCount: session.utterances.length
        });
        return session.id;
      } finally {
        clearActiveSession();
        overlaySessionEndPromise = null;
      }
    })();
  }

  return overlaySessionEndPromise;
}

function resetOverlayLifecycle(): void {
  mainWindow = null;
  overlayHandlersRegistered = false;
  overlayCloseInFlight = false;
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: WINDOW_CONFIG.overlay.width,
    height: 560,
    y: 40,
    minWidth: WINDOW_CONFIG.overlay.minWidth,
    minHeight: 60,
    maxWidth: WINDOW_CONFIG.overlay.width,
    maxHeight: 560,
    frame: false,
    transparent: true,
    backgroundColor: WINDOW_CONFIG.overlay.backgroundColor,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    useContentSize: true,
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
    settings.llmProvider === 'codex' ||
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
  ipcMain.handle(IPC_CHANNELS.saveSettings, async (_event, settings) => saveAllSettings(settings));
  ipcMain.handle(IPC_CHANNELS.clearHistory, async () => {
    await clearMessages();
  });
  ipcMain.handle(IPC_CHANNELS.getUsageStats, async () => getUsageStats());

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
  await startOverlaySession();

  mainWindow.on('close', (event) => {
    if (overlayCloseInFlight) {
      return;
    }

    if (!getActiveSession()) {
      resetOverlayLifecycle();
      return;
    }

    event.preventDefault();
    overlayCloseInFlight = true;
    void endActiveOverlaySession()
      .catch((error) => {
        console.error('[SESSION] Failed to end active session during overlay close', error);
      })
      .finally(() => {
        mainWindow?.destroy();
      });
  });

  mainWindow.on('closed', () => {
    resetOverlayLifecycle();
  });

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

function registerSessionLifecycleHandlers(): void {
  if (sessionLifecycleHandlersRegistered) {
    return;
  }

  sessionLifecycleHandlersRegistered = true;

  ipcMain.handle(IPC_CHANNELS.endSessionAndReview, async () => {
    overlayCloseInFlight = true;
    const sessionId = await endActiveOverlaySession();

    if (sessionId) {
      await shell.openExternal(getDashboardAppUrl(sessionId));
    }

    mainWindow?.destroy();
    return { success: true, sessionId };
  });

  ipcMain.handle(IPC_CHANNELS.dashboardOpen, async (_event, payload?: { sessionId?: string }) => {
    await shell.openExternal(getDashboardAppUrl(payload?.sessionId));
    return { ok: true };
  });
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
        provider: 'codex' | 'gemini' | 'ollama';
        codexModel?: string;
        geminiApiKey?: string;
        geminiModel?: string;
        ollamaEndpoint?: string;
        ollamaModel?: string;
      }
    ) => {
      try {
        if (config.provider === 'codex') {
          const provider = new CodexProvider({
            model: normalizeCodexModel(config.codexModel || PROVIDER_DEFAULTS.codexModel)
          });
          return await provider.testConnection();
        }

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
    await saveAllSettings(settings);
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

    await initDatabase();
    registerDashboardCommandHandlers({
      launchOverlay
    });
    await startDashboardWebServer();
    registerCommonHandlers();
    registerSetupHandlers();
    registerSessionLifecycleHandlers();
    initSessionHandlers();

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

app.on('before-quit', () => {
  void stopDashboardWebServer().catch((error) => {
    console.warn('[DASHBOARD API] Failed to stop cleanly', error);
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

void bootstrap();
