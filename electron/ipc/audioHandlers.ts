import { ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../src/shared';
import { transcriptService } from '../services/googleSTT';

let pendingStartTimer: NodeJS.Timeout | null = null;
let listenersBound = false;

export function initAudioHandlers(mainWindow: BrowserWindow): void {
  const bindListeners = () => {
    if (listenersBound) {
      transcriptService.removeAllListeners('transcript');
      transcriptService.removeAllListeners('error');
      transcriptService.removeAllListeners('status');
    }

    transcriptService.on('transcript', (text: string) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.transcriptUpdate, {
          text,
          timestamp: Date.now()
        });
      }
    });

    transcriptService.on('error', (error: Error) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.transcriptError, {
          message: error.message
        });
      }
    });

    transcriptService.on('status', (status: string) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.transcriptStatus, {
          status
        });
      }
    });

    listenersBound = true;
  };

  ipcMain.handle(IPC_CHANNELS.startAudioCapture, async () => {
    bindListeners();

    if (pendingStartTimer) {
      clearTimeout(pendingStartTimer);
      pendingStartTimer = null;
    }

    if (transcriptService.isRunning()) {
      return { success: true, running: true };
    }

    await new Promise<void>((resolve) => {
      pendingStartTimer = setTimeout(() => {
        pendingStartTimer = null;
        if (!transcriptService.isRunning()) {
          transcriptService.start();
        }
        resolve();
      }, 600);
    });

    return { success: true };
  });

  ipcMain.on(IPC_CHANNELS.pushAudioChunk, (_event, chunk: Uint8Array | ArrayBuffer | Buffer | null | undefined) => {
    if (!chunk) {
      return;
    }

    try {
      const resolved =
        chunk instanceof ArrayBuffer ? Buffer.from(chunk) : Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      console.log(`[AUDIO] Received PCM chunk: ${resolved.length} bytes`);
      transcriptService.pushPCM(resolved);
    } catch (error) {
      console.warn('[AUDIO] Failed to forward PCM chunk:', error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.stopAudioCapture, async () => {
    if (pendingStartTimer) {
      clearTimeout(pendingStartTimer);
      pendingStartTimer = null;
    }
    transcriptService.stop();
    transcriptService.removeAllListeners('transcript');
    transcriptService.removeAllListeners('error');
    transcriptService.removeAllListeners('status');
    listenersBound = false;
    return { success: true };
  });

  ipcMain.handle('audio:status', async () => ({
    transcriptRunning: transcriptService.isRunning(),
    serverReady: transcriptService.isServerReady(),
    serverError: transcriptService.getServerError(),
    lastTranscript: transcriptService.getLastTranscript()
  }));
}
