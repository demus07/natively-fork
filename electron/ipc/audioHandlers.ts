import { ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../src/shared';
import { SESSION_RUNTIME_CONFIG } from '../../src/config';
import { registry } from '../services/providerRegistry';
import { getActiveSession } from '../services/activeSession';
import { sessionService } from '../services/SessionService';

let pendingStartTimer: NodeJS.Timeout | null = null;
let listenersBound = false;
let handlersRegistered = false;

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
  if (pendingStartTimer) {
    clearTimeout(pendingStartTimer);
    pendingStartTimer = null;
  }
  stt.stop();
  stt.removeAllListeners('transcript');
  stt.removeAllListeners('interim');
  stt.removeAllListeners('error');
  stt.removeAllListeners('status');
  listenersBound = false;
}

export function stopAudioCapturePipeline(): void {
  cleanupAudioListeners();
}

export function initAudioHandlers(mainWindow: BrowserWindow): void {
  const bindListeners = () => {
    const stt = registry.getSTT();
    if (listenersBound) {
      stt.removeAllListeners('transcript');
      stt.removeAllListeners('interim');
      stt.removeAllListeners('error');
      stt.removeAllListeners('status');
    }

    stt.on('interim', (text: string) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.transcriptInterim, text);
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
          isFinal: true
        }).catch((error) => {
          console.warn('[SESSION] Failed to append utterance:', error);
        });
      }

      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.transcriptUpdate, {
          text,
          timestamp: Date.now()
        });
      }
    });

    stt.on('error', (error: Error) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.transcriptError, {
          message: error.message
        });
      }
    });

    stt.on('status', (status: string) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.transcriptStatus, {
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

      if (pendingStartTimer) {
        clearTimeout(pendingStartTimer);
        pendingStartTimer = null;
      }

      if (registry.getSTT().isRunning()) {
        return { success: true, running: true };
      }

      await new Promise<void>((resolve) => {
        pendingStartTimer = setTimeout(() => {
          pendingStartTimer = null;
          if (!registry.getSTT().isRunning()) {
            registry.getSTT().start();
          }
          resolve();
        }, 600);
      });

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
