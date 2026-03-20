import { ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../src/shared';
import { AI_RUNTIME_CONFIG } from '../../src/config';
import type { AIPayload, Message } from '../../renderer/types';
import { routeAIRequest } from '../services/aiRouter';
import { registry } from '../services/providerRegistry';
import { getActiveSession } from '../services/activeSession';
import { getMessages, saveMessage, trackUsage } from '../services/database';

let currentWindow: BrowserWindow | null = null;
let currentCaptureFullScreen: (() => Promise<string>) | null = null;
let fallbackSessionId = '';
let handlersRegistered = false;

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

export function initAIHandlers(
  mainWindow: BrowserWindow,
  sessionId: string,
  captureFullScreen: () => Promise<string>
): void {
  currentWindow = mainWindow;
  currentCaptureFullScreen = captureFullScreen;
  fallbackSessionId = sessionId;

  if (handlersRegistered) {
    return;
  }
  handlersRegistered = true;

  ipcMain.handle(IPC_CHANNELS.sendAIMessage, async (_event, payload: AIPayload) => {
    if (!currentWindow || !currentCaptureFullScreen) {
      throw new Error('Overlay window is not ready for AI requests');
    }

    console.log('[AI HANDLER] received request, type:', payload.type);
    let assistantResponse = '';
    try {
      const promptSource =
        payload.type === 'custom' ? payload.userMessage?.trim() || 'Custom prompt' : payload.type;
      const activeSessionId = getActiveSession()?.sessionId ?? fallbackSessionId;
      await saveMessage('user', promptSource, activeSessionId);

      let screenshot = payload.screenshot ?? null;
      if (!screenshot && registry.getLLM().supportsVision) {
        const screenshotPromise = currentCaptureFullScreen().catch((error) => {
          console.warn('[SCREEN] Screenshot unavailable — sending text-only request', error);
          return null;
        });
        screenshot = await Promise.race([
          screenshotPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), AI_RUNTIME_CONFIG.screenshotCaptureTimeoutMs))
        ]);
      } else if (!registry.getLLM().supportsVision) {
        screenshot = null;
        console.log('[SCREEN] Skipping screenshot capture — current model does not support vision');
      }

      console.log('[AI HANDLER] calling routeAIRequest');
      assistantResponse = (
        await routeAIRequest(
          {
            ...payload,
            screenshot
          },
          currentWindow
        )
      ).response;

      const tokensUsed = estimateTokens(assistantResponse);
      await saveMessage('assistant', assistantResponse, activeSessionId, tokensUsed);
      await trackUsage(tokensUsed);
    } catch (error) {
      const message =
        error instanceof Error
          ? `AI request failed: ${error.message}`
          : 'AI request failed. Check your provider settings and try again.';
      if (currentWindow && !currentWindow.isDestroyed()) {
        currentWindow.webContents.send(IPC_CHANNELS.aiError, message);
      }
    }
  });

  ipcMain.handle(IPC_CHANNELS.getConversationHistory, async () =>
    ((await getMessages(undefined, 100)) as Array<{
      id: number;
      role: Message['role'];
      content: string;
      timestamp: string;
    }>).map((message) => ({
      id: String(message.id),
      role: message.role,
      content: message.content,
      timestamp: message.timestamp
    }))
  );
}
