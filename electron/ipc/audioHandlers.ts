import { ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../src/shared';
import { SESSION_RUNTIME_CONFIG } from '../../src/config';
import { registry } from '../services/providerRegistry';
import { getActiveSession } from '../services/activeSession';
import { sessionService } from '../services/SessionService';

let listenersBound = false;
let handlersRegistered = false;
let currentSourceHint: 'me' | 'them' | 'unknown' = 'unknown';
let currentWindow: BrowserWindow | null = null;

function estimateUtteranceDuration(text: string): number {
  return Math.max(
    SESSION_RUNTIME_CONFIG.minUtteranceDurationMs,
    Math.min(
      SESSION_RUNTIME_CONFIG.maxUtteranceDurationMs,
      text.trim().length * SESSION_RUNTIME_CONFIG.estimatedUtteranceMsPerCharacter
    )
  );
}

function cleanupAudioListeners(): void {
  const stt = registry.getSTT();
  stt.stop();
  stt.removeAllListeners('transcript');
  stt.removeAllListeners('interim');
  stt.removeAllListeners('error');
  stt.removeAllListeners('status');
  listenersBound = false;
  currentSourceHint = 'unknown';
}

export function stopAudioCapturePipeline(): void {
  cleanupAudioListeners();
}

export function initAudioHandlers(mainWindow: BrowserWindow): void {
  currentWindow = mainWindow;

  const bindListeners = () => {
    const stt = registry.getSTT();
    if (listenersBound) {
      stt.removeAllListeners('transcript');
      stt.removeAllListeners('interim');
      stt.removeAllListeners('error');
      stt.removeAllListeners('status');
    }

    stt.on('interim', (text: string) => {
      if (currentWindow && !currentWindow.isDestroyed()) {
        currentWindow.webContents.send(IPC_CHANNELS.transcriptInterim, text);
      }
    });

    stt.on('transcript', (text: string) => {
      const activeSession = getActiveSession();
      if (activeSession) {
        const endedMs = Math.max(0, Date.now() - activeSession.createdAt);
        const startedMs = Math.max(0, endedMs - estimateUtteranceDuration(text));
        void sessionService.appendUtterance(activeSession.sessionId, {
          sessionId: activeSession.sessionId,
          startedMs,
          endedMs,
          text,
          isFinal: true,
          source: currentSourceHint
        }).catch((error) => {
          console.warn('[SESSION] Failed to append utterance:', error);
        });
      }

      if (currentWindow && !currentWindow.isDestroyed()) {
        currentWindow.webContents.send(IPC_CHANNELS.transcriptUpdate, {
          text,
          timestamp: Date.now()
        });
      }
    });

    stt.on('error', (error: Error) => {
      if (currentWindow && !currentWindow.isDestroyed()) {
        currentWindow.webContents.send(IPC_CHANNELS.transcriptError, {
          message: error.message
        });
      }
    });

    stt.on('status', (status: string) => {
      if (currentWindow && !currentWindow.isDestroyed()) {
        currentWindow.webContents.send(IPC_CHANNELS.transcriptStatus, {
          status
        });
      }
    });

    listenersBound = true;
  };

  if (!handlersRegistered) {
    handlersRegistered = true;

    ipcMain.handle(IPC_CHANNELS.startAudioCapture, async () => {
      bindListeners();

      if (registry.getSTT().isRunning()) {
        return { success: true, running: true };
      }

      registry.getSTT().start();

      return { success: true };
    });

    ipcMain.on(IPC_CHANNELS.pushAudioChunk, (_event, chunk: Uint8Array | ArrayBuffer | Buffer | null | undefined) => {
      if (!chunk) return;
      try {
        const resolved =
          chunk instanceof ArrayBuffer ? Buffer.from(chunk) :
          Buffer.isBuffer(chunk) ? chunk :
          Buffer.from(chunk);
        console.log(`[AUDIO] Received PCM chunk: ${resolved.length} bytes`);
        registry.getSTT().pushPCM(resolved);
      } catch (error) {
        console.warn('[AUDIO] Failed to forward PCM chunk:', error);
      }
    });

    ipcMain.on(IPC_CHANNELS.setAudioSourceHint, (_event, source: 'me' | 'them' | 'unknown') => {
      currentSourceHint = source;
    });

    ipcMain.handle(IPC_CHANNELS.stopAudioCapture, async () => {
      cleanupAudioListeners();
      return { success: true };
    });

    ipcMain.handle('audio:status', async () => ({
      transcriptRunning: registry.getSTT().isRunning(),
      serverReady: registry.getSTT().isServerReady(),
      serverError: registry.getSTT().getServerError(),
      lastTranscript: registry.getSTT().getLastTranscript()
    }));
  }
}
