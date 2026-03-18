import { ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../src/shared';
import { registry } from '../services/providerRegistry';

let pendingStartTimer: NodeJS.Timeout | null = null;
let listenersBound = false;
let handlersRegistered = false;

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
      if (pendingStartTimer) {
        clearTimeout(pendingStartTimer);
        pendingStartTimer = null;
      }
      const stt = registry.getSTT();
      stt.stop();
      stt.removeAllListeners('transcript');
      stt.removeAllListeners('interim');
      stt.removeAllListeners('error');
      stt.removeAllListeners('status');
      listenersBound = false;
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
