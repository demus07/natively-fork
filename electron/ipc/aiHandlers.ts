import { ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../src/shared';
import type { AIPayload, Message } from '../../renderer/types';
import { routeAIRequest } from '../services/aiRouter';
import { getMessages, saveMessage, trackUsage } from '../services/database';

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

export function initAIHandlers(
  mainWindow: BrowserWindow,
  sessionId: string,
  captureFullScreen: () => Promise<string>
): void {
  ipcMain.handle(IPC_CHANNELS.sendAIMessage, async (_event, payload: AIPayload) => {
    let assistantResponse = '';
    try {
      const promptSource =
        payload.type === 'custom' ? payload.userMessage?.trim() || 'Custom prompt' : payload.type;
      saveMessage('user', promptSource, sessionId);

      let screenshot = payload.screenshot;
      if (!screenshot) {
        try {
          screenshot = await captureFullScreen();
        } catch (error) {
          console.warn('[SCREEN] Screenshot unavailable — sending text-only request', error);
        }
      }

      assistantResponse = (
        await routeAIRequest(
          {
            ...payload,
            screenshot
          },
          mainWindow
        )
      ).response;

      const tokensUsed = estimateTokens(assistantResponse);
      saveMessage('assistant', assistantResponse, sessionId, tokensUsed);
      trackUsage(tokensUsed);
    } catch (error) {
      const message =
        error instanceof Error
          ? `AI request failed: ${error.message}`
          : 'AI request failed. Check your provider settings and try again.';
      mainWindow.webContents.send(IPC_CHANNELS.aiError, message);
    }
  });

  ipcMain.handle(IPC_CHANNELS.getConversationHistory, async () =>
    (getMessages(undefined, 100) as Array<{
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
